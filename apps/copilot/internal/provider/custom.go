package provider

import "context"

type customAdapter struct {
	*openaiAdapter
}

func NewCustomAdapter(apiKey, baseURL string) ProviderAdapter {
	base := newOpenAIAdapterWithBaseURL(apiKey, baseURL)
	base.providerName = "custom"
	return &customAdapter{
		openaiAdapter: base,
	}
}

func (a *customAdapter) StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error) {
	return a.openaiAdapter.StreamChat(ctx, model, systemPrompt, messages, tools)
}
