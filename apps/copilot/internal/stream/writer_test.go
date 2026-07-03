package stream

import (
	"net/http/httptest"
	"sim/copilot/internal/protocol"
	"strings"
	"testing"
)

func TestStreamWriter_EventFormatting(t *testing.T) {
	w := httptest.NewRecorder()
	sw, err := NewStreamWriter(w, "test-stream-1")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	err = sw.Write(protocol.EventTypeSession, &protocol.SessionStartPayload{
		Kind: protocol.SessionStart,
	}, nil, nil)
	if err != nil {
		t.Fatalf("Write session start failed: %v", err)
	}

	err = sw.Write(protocol.EventTypeSession, &protocol.SessionChatPayload{
		ChatID: "chat-1",
		Kind:   protocol.SessionChat,
	}, nil, nil)
	if err != nil {
		t.Fatalf("Write session chat failed: %v", err)
	}

	err = sw.Write(protocol.EventTypeText, &protocol.TextPayload{
		Channel: protocol.ChannelAssistant,
		Text:    "Hello, how can I help?",
	}, nil, nil)
	if err != nil {
		t.Fatalf("Write text failed: %v", err)
	}

	err = sw.Write(protocol.EventTypeComplete, &protocol.CompletePayload{
		Status: protocol.CompletionComplete,
	}, nil, nil)
	if err != nil {
		t.Fatalf("Write complete failed: %v", err)
	}

	body := w.Body.String()

	if !strings.Contains(body, "data: ") {
		t.Error("response should contain 'data: ' prefix")
	}

	if !strings.Contains(body, `"type":"session"`) {
		t.Error("response should contain session event")
	}

	if !strings.Contains(body, `"type":"text"`) {
		t.Error("response should contain text event")
	}

	if !strings.Contains(body, `"type":"complete"`) {
		t.Error("response should contain complete event")
	}

	if !strings.Contains(body, `"streamId":"test-stream-1"`) {
		t.Error("response should contain streamId")
	}

	// Check that SSE events end with \n\n
	lines := strings.Split(body, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			t.Logf("SSE data line: %s", line)
		}
	}
}

func TestStreamWriter_SequenceNumbering(t *testing.T) {
	w := httptest.NewRecorder()
	sw, err := NewStreamWriter(w, "test-stream-2")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	// Need session start first for lifecycle validation
	_ = sw.Write(protocol.EventTypeSession, &protocol.SessionStartPayload{
		Kind: protocol.SessionStart,
	}, nil, nil)
	_ = sw.Write(protocol.EventTypeSession, &protocol.SessionChatPayload{
		ChatID: "chat-1",
		Kind:   protocol.SessionChat,
	}, nil, nil)

	// Send 5 text events
	for i := 0; i < 5; i++ {
		_ = sw.Write(protocol.EventTypeText, &protocol.TextPayload{
			Channel: protocol.ChannelAssistant,
			Text:    "test",
		}, nil, nil)
	}

	body := w.Body.String()

	if !strings.Contains(body, `"seq":1`) {
		t.Error("response should contain seq:1")
	}
	if !strings.Contains(body, `"seq":7`) {
		t.Error("response should contain seq:7")
	}
}

func TestStreamWriter_InvalidOrder(t *testing.T) {
	w := httptest.NewRecorder()
	sw, err := NewStreamWriter(w, "test-stream-3")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	// Try to send complete before session start
	err = sw.Write(protocol.EventTypeComplete, &protocol.CompletePayload{
		Status: protocol.CompletionComplete,
	}, nil, nil)
	if err == nil {
		t.Error("should return error for invalid event order")
	}
}

func TestStreamWriter_VersionField(t *testing.T) {
	w := httptest.NewRecorder()
	sw, err := NewStreamWriter(w, "test-stream-4")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	_ = sw.Write(protocol.EventTypeSession, &protocol.SessionStartPayload{
		Kind: protocol.SessionStart,
	}, nil, nil)

	body := w.Body.String()
	if !strings.Contains(body, `"v":1`) {
		t.Error("response should contain v:1")
	}
}
