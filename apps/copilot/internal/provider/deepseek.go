package provider

import "context"

type deepseekAdapter struct {
	*openaiAdapter
}

func NewDeepSeekAdapter(apiKey string) ProviderAdapter {
	base := newOpenAIAdapterWithBaseURL(apiKey, "https://api.deepseek.com")
	base.providerName = "deepseek"
	return &deepseekAdapter{
		openaiAdapter: base,
	}
}

func (a *deepseekAdapter) StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error) {
	if model == "" {
		model = "deepseek-v4-pro"
	}
	return a.openaiAdapter.StreamChat(ctx, model, systemPrompt, messages, tools)
}
