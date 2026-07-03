package main

import (
	"context"
	"sync"
)

type streamManager struct {
	mu      sync.Mutex
	streams map[string]context.CancelFunc
}

func newStreamManager() *streamManager {
	return &streamManager{
		streams: make(map[string]context.CancelFunc),
	}
}

func (sm *streamManager) Register(streamID string, cancel context.CancelFunc) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.streams[streamID] = cancel
}

func (sm *streamManager) Cancel(streamID string) {
	sm.mu.Lock()
	cancel, ok := sm.streams[streamID]
	if ok {
		delete(sm.streams, streamID)
	}
	sm.mu.Unlock()

	if cancel != nil {
		cancel()
	}
}

func (sm *streamManager) Unregister(streamID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.streams, streamID)
}
