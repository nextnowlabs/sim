package title

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sim/copilot/internal/provider"
)

// recordingAdapter captures the model passed to StreamChat so tests can
// assert the default model is used regardless of the request's model field.
type recordingAdapter struct {
	events    []provider.StreamEvent
	streamErr error
	calls     []string
}

func (a *recordingAdapter) StreamChat(ctx context.Context, model string, _ string, _ []provider.Message, _ []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	a.calls = append(a.calls, model)
	if a.streamErr != nil {
		return nil, a.streamErr
	}
	ch := make(chan provider.StreamEvent, len(a.events)+1)
	go func() {
		defer close(ch)
		for _, e := range a.events {
			select {
			case <-ctx.Done():
				return
			case ch <- e:
			}
		}
	}()
	return ch, nil
}

func TestGenerate_LLMSuccess(t *testing.T) {
	adapter := &recordingAdapter{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: `"Build a Slack `},
			{Type: provider.EventTextDelta, TextDelta: `workflow"`},
			{Type: provider.EventDone},
		},
	}
	g := NewGenerator(adapter, "default-model")

	got := g.Generate(context.Background(), "build a slack workflow")

	if got != "Build a Slack workflow" {
		t.Errorf("expected sanitized title, got %q", got)
	}
	if len(adapter.calls) != 1 || adapter.calls[0] != "default-model" {
		t.Errorf("expected default model usage, got %v", adapter.calls)
	}
}

func TestGenerate_UsesDefaultModelIgnoringRequestModel(t *testing.T) {
	adapter := &recordingAdapter{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: "ok"},
			{Type: provider.EventDone},
		},
	}
	g := NewGenerator(adapter, "default-model")

	req := httptest.NewRequest(http.MethodPost, "/api/generate-chat-title",
		strings.NewReader(`{"message":"hello","model":"claude-opus-4-8"}`))
	rr := httptest.NewRecorder()
	g.Handler()(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if len(adapter.calls) != 1 || adapter.calls[0] != "default-model" {
		t.Errorf("expected default model usage, got %v", adapter.calls)
	}
	if !strings.Contains(rr.Body.String(), `"title":"ok"`) {
		t.Errorf("unexpected body: %s", rr.Body.String())
	}
}

func TestGenerate_LLMErrorFallsBackToTruncatedMessage(t *testing.T) {
	adapter := &recordingAdapter{
		events: []provider.StreamEvent{
			{Type: provider.EventError, Error: context.Canceled},
		},
	}
	g := NewGenerator(adapter, "default-model")

	got := g.Generate(context.Background(), "a very long first message that exceeds the title cap and should be truncated")

	if got == "" {
		t.Fatal("fallback title must never be empty")
	}
	if len([]rune(got)) > maxTitleRunes {
		t.Errorf("fallback title exceeds %d runes: %q", maxTitleRunes, got)
	}
}

func TestGenerate_EmptyLLMOutputFallsBack(t *testing.T) {
	adapter := &recordingAdapter{events: []provider.StreamEvent{{Type: provider.EventDone}}}
	g := NewGenerator(adapter, "default-model")

	got := g.Generate(context.Background(), "hello world")

	if got != "hello world" {
		t.Errorf("expected truncated message fallback, got %q", got)
	}
}

func TestGenerate_StreamErrorFallsBack(t *testing.T) {
	adapter := &recordingAdapter{streamErr: context.DeadlineExceeded}
	g := NewGenerator(adapter, "default-model")

	got := g.Generate(context.Background(), "hello")

	if got != "hello" {
		t.Errorf("expected truncated message fallback, got %q", got)
	}
}

func TestSanitize(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{`"quoted title"`, "quoted title"},
		{`'single quoted'`, "single quoted"},
		{"  spaced  out  ", "spaced  out"},
		{strings.Repeat("a", 100), strings.Repeat("a", maxTitleRunes)},
	}
	for _, c := range cases {
		if got := sanitize(c.in); got != c.want {
			t.Errorf("sanitize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestHandler_MissingMessageReturns400(t *testing.T) {
	g := NewGenerator(&recordingAdapter{}, "default-model")

	req := httptest.NewRequest(http.MethodPost, "/api/generate-chat-title", strings.NewReader(`{"message":""}`))
	rr := httptest.NewRecorder()
	g.Handler()(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty message, got %d", rr.Code)
	}
}

func TestHandler_InvalidJSONReturns400(t *testing.T) {
	g := NewGenerator(&recordingAdapter{}, "default-model")

	req := httptest.NewRequest(http.MethodPost, "/api/generate-chat-title", strings.NewReader(`not json`))
	rr := httptest.NewRecorder()
	g.Handler()(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", rr.Code)
	}
}

func TestHandler_ExtraFieldsAccepted(t *testing.T) {
	adapter := &recordingAdapter{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: "t"},
			{Type: provider.EventDone},
		},
	}
	g := NewGenerator(adapter, "default-model")

	req := httptest.NewRequest(http.MethodPost, "/api/generate-chat-title",
		strings.NewReader(`{"message":"hello","model":"m","provider":"p","workspaceId":"w","userId":"u"}`))
	rr := httptest.NewRecorder()
	g.Handler()(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 with extra fields, got %d", rr.Code)
	}
}
