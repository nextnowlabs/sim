package stream

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sim/copilot/internal/protocol"
	"sync"
	"sync/atomic"
	"time"
)

type writeRequest struct {
	event *protocol.Envelope
	errCh chan error
}

type StreamWriter struct {
	w          http.ResponseWriter
	flusher    http.Flusher
	streamRef  protocol.StreamRef
	seq        atomic.Int64
	startTime  time.Time
	writeCh    chan writeRequest
	doneCh     chan struct{}
	keepaliveCh chan struct{}
	mu         sync.Mutex
	closed     bool
	state      string
}

const (
	stateInit      = "init"
	stateStarted   = "started"
	stateChatted   = "chatted"
	stateCompleted = "completed"
)

var (
	ErrClosed       = fmt.Errorf("stream is closed")
	ErrInvalidOrder = fmt.Errorf("events must be emitted in order: session(start) -> session(chat) -> text/tool -> complete")
)

func NewStreamWriter(w http.ResponseWriter, streamID string) (*StreamWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("response writer does not support flushing")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	sw := &StreamWriter{
		w:           w,
		flusher:     flusher,
		streamRef:   protocol.StreamRef{StreamID: streamID},
		startTime:   time.Now(),
		writeCh:     make(chan writeRequest),
		doneCh:      make(chan struct{}),
		keepaliveCh: make(chan struct{}, 1),
		state:       stateInit,
	}

	go sw.processWrites()
	go sw.keepalive()

	return sw, nil
}

func (sw *StreamWriter) processWrites() {
	for {
		select {
		case req, ok := <-sw.writeCh:
			if !ok {
				return
			}
			sw.writeEvent(req.event)
			req.errCh <- nil
		case <-sw.doneCh:
			return
		}
	}
}

func (sw *StreamWriter) keepalive() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			sw.mu.Lock()
			if !sw.closed {
				fmt.Fprintf(sw.w, ": keepalive\n\n")
				sw.flusher.Flush()
			}
			sw.mu.Unlock()
		case <-sw.keepaliveCh:
			ticker.Reset(15 * time.Second)
		case <-sw.doneCh:
			return
		}
	}
}

func (sw *StreamWriter) validateOrder(typ string, payload interface{}) error {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	switch sw.state {
	case stateInit:
		if typ != protocol.EventTypeSession {
			return ErrInvalidOrder
		}
		sp, ok := payload.(*protocol.SessionStartPayload)
		if !ok || sp.Kind != protocol.SessionStart {
			return ErrInvalidOrder
		}
		sw.state = stateStarted
	case stateStarted:
		if typ == protocol.EventTypeSession {
			switch p := payload.(type) {
			case *protocol.SessionChatPayload:
				if p.Kind != protocol.SessionChat {
					return ErrInvalidOrder
				}
				sw.state = stateChatted
			case *protocol.SessionTitlePayload:
				if p.Kind != protocol.SessionTitle {
					return ErrInvalidOrder
				}
			case *protocol.SessionTracePayload:
				if p.Kind != protocol.SessionTrace {
					return ErrInvalidOrder
				}
			default:
				return ErrInvalidOrder
			}
		}
	case stateChatted:
		if typ == protocol.EventTypeComplete {
			sw.state = stateCompleted
		}
	case stateCompleted:
		return fmt.Errorf("stream already completed")
	}

	return nil
}

func (sw *StreamWriter) Write(typ string, payload interface{}, trace *protocol.Trace, scope *protocol.StreamScope) error {
	sw.mu.Lock()
	if sw.closed {
		sw.mu.Unlock()
		return ErrClosed
	}
	sw.mu.Unlock()

	if err := sw.validateOrder(typ, payload); err != nil {
		return err
	}

	seq := sw.seq.Add(1)
	ts := time.Now().UTC().Format(time.RFC3339Nano)

	env := protocol.NewEnvelope(typ, sw.streamRef, seq, ts, payload)
	env.Trace = trace
	env.Scope = scope

	errCh := make(chan error, 1)

	select {
	case sw.keepaliveCh <- struct{}{}:
	default:
	}

	sw.writeCh <- writeRequest{event: env, errCh: errCh}
	return <-errCh
}

func (sw *StreamWriter) writeEvent(event *protocol.Envelope) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if sw.closed {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	fmt.Fprintf(sw.w, "data: %s\n\n", data)
	sw.flusher.Flush()
}

func (sw *StreamWriter) Close() {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if sw.closed {
		return
	}

	sw.closed = true
	close(sw.doneCh)
}
