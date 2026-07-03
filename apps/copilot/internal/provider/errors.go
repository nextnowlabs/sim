package provider

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type ProviderError struct {
	StatusCode   int
	Provider     string
	Code         string
	Message      string
	Body         string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("%s returned %d (%s): %s", e.Provider, e.StatusCode, e.Code, e.Message)
}

func checkHTTPError(resp *http.Response, provider string) error {
	if resp.StatusCode < 400 {
		return nil
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	body := string(bodyBytes)

	pe := &ProviderError{
		StatusCode: resp.StatusCode,
		Provider:   provider,
		Body:       body,
	}

	switch resp.StatusCode {
	case 401:
		pe.Code = "auth_error"
		pe.Message = "invalid api key"
	case 402:
		pe.Code = "payment_required"
		pe.Message = "account has insufficient credits"
	case 429:
		pe.Code = "rate_limit"
		pe.Message = "rate limit exceeded"
	default:
		if resp.StatusCode >= 500 {
			pe.Code = "provider_error"
			pe.Message = "provider server error"
		} else {
			pe.Code = "bad_request"
			pe.Message = "invalid request"
		}
	}

	// Try to extract a better error message from the response body
	var errResp struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if json.Unmarshal(bodyBytes, &errResp) == nil && errResp.Error.Message != "" {
		pe.Message = errResp.Error.Message
	}

	return pe
}

func MapProviderError(err error, provider string) *ProviderError {
	if pe, ok := err.(*ProviderError); ok {
		return pe
	}

	msg := err.Error()

	code := "internal_error"
	if strings.Contains(strings.ToLower(msg), "timeout") {
		code = "timeout"
	} else if strings.Contains(strings.ToLower(msg), "cancelled") {
		code = "cancelled"
	}

	return &ProviderError{
		Provider: provider,
		Code:     code,
		Message:  msg,
	}
}
