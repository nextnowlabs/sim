package provider

import (
	"context"
	"net/http"
)

type openrouterAdapter struct {
	*openaiAdapter
}

func NewOpenRouterAdapter(apiKey string) ProviderAdapter {
	base := newOpenAIAdapterWithBaseURL(apiKey, "https://openrouter.ai/api/v1")
	base.providerName = "openrouter"
	return &openrouterAdapter{
		openaiAdapter: base,
	}
}

func (a *openrouterAdapter) StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error) {
	origTransport := a.openaiAdapter.client.Transport
	if origTransport == nil {
		origTransport = http.DefaultTransport
	}
	a.openaiAdapter.client.Transport = &openRouterTransport{original: origTransport}
	defer func() { a.openaiAdapter.client.Transport = origTransport }()

	return a.openaiAdapter.StreamChat(ctx, model, systemPrompt, messages, tools)
}

type openRouterTransport struct {
	original http.RoundTripper
}

func (rt *openRouterTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("HTTP-Referer", "https://sim.ai")
	req.Header.Set("X-Title", "Sim Copilot")
	return rt.original.RoundTrip(req)
}
