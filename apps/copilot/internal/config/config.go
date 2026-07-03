package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	LLMProvider   string
	AnthropicKey  string
	OpenAIKey     string
	OpenRouterKey string
	DeepSeekKey   string
	CustomKey     string
	CustomBaseURL string
	DefaultModel  string

	SimInternalURL    string
	InternalAPISecret string

	PromptPath string
	ListenAddr string
}

const (
	defaultListenAddr = ":3002"
)

var validProviders = map[string]bool{
	"anthropic":  true,
	"openai":     true,
	"openrouter": true,
	"deepseek":   true,
	"custom":     true,
}

func Load() (*Config, error) {
	cfg := &Config{
		LLMProvider:       os.Getenv("COPILOT_LLM_PROVIDER"),
		AnthropicKey:      os.Getenv("ANTHROPIC_API_KEY"),
		OpenAIKey:         os.Getenv("OPENAI_API_KEY"),
		OpenRouterKey:     os.Getenv("OPENROUTER_API_KEY"),
		DeepSeekKey:       os.Getenv("DEEPSEEK_API_KEY"),
		CustomKey:         os.Getenv("CUSTOM_LLM_API_KEY"),
		CustomBaseURL:     strings.TrimRight(os.Getenv("CUSTOM_LLM_BASE_URL"), "/"),
		DefaultModel:      os.Getenv("COPILOT_DEFAULT_MODEL"),
		SimInternalURL:    strings.TrimRight(os.Getenv("SIM_INTERNAL_URL"), "/"),
		InternalAPISecret: os.Getenv("INTERNAL_API_SECRET"),
		PromptPath:        os.Getenv("COPILOT_PROMPT_PATH"),
		ListenAddr:        os.Getenv("COPILOT_LISTEN_ADDR"),
	}

	if cfg.ListenAddr == "" {
		cfg.ListenAddr = defaultListenAddr
	}

	var missing []string

	if cfg.LLMProvider == "" {
		missing = append(missing, "COPILOT_LLM_PROVIDER")
	} else if !validProviders[strings.ToLower(cfg.LLMProvider)] {
		return nil, fmt.Errorf("invalid COPILOT_LLM_PROVIDER=%q: must be one of anthropic, openai, openrouter, deepseek, custom", cfg.LLMProvider)
	}

	provider := strings.ToLower(cfg.LLMProvider)
	switch provider {
	case "anthropic":
		if cfg.AnthropicKey == "" {
			missing = append(missing, "ANTHROPIC_API_KEY")
		}
	case "openai":
		if cfg.OpenAIKey == "" {
			missing = append(missing, "OPENAI_API_KEY")
		}
	case "openrouter":
		if cfg.OpenRouterKey == "" {
			missing = append(missing, "OPENROUTER_API_KEY")
		}
	case "deepseek":
		if cfg.DeepSeekKey == "" {
			missing = append(missing, "DEEPSEEK_API_KEY")
		}
	case "custom":
		if cfg.CustomKey == "" {
			missing = append(missing, "CUSTOM_LLM_API_KEY")
		}
		if cfg.CustomBaseURL == "" {
			missing = append(missing, "CUSTOM_LLM_BASE_URL")
		}
	}

	if cfg.DefaultModel == "" {
		missing = append(missing, "COPILOT_DEFAULT_MODEL")
	}

	if cfg.SimInternalURL == "" {
		missing = append(missing, "SIM_INTERNAL_URL")
	}

	if cfg.InternalAPISecret == "" {
		missing = append(missing, "INTERNAL_API_SECRET")
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}

	return cfg, nil
}
