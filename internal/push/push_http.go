package push

import (
	"bytes"
	"io"
	"net/http"

	"github.com/injoyai/conv"
	"github.com/injoyai/script-gateway/internal/types"
)

type HTTP struct {
	URL    string
	Method string
	Header map[string]string
	Client *http.Client
}

func NewHTTP(url, method string) *HTTP {
	if method == "" {
		method = http.MethodPost
	}
	return &HTTP{
		URL:    url,
		Method: method,
		Client: http.DefaultClient,
	}
}

func (this *HTTP) SetHeader(h map[string]string) *HTTP {
	this.Header = h
	return this
}

func (this *HTTP) PushRaw(msg any) error {
	bs := conv.Bytes(msg)
	req, err := http.NewRequest(this.Method, this.URL, bytes.NewReader(bs))
	if err != nil {
		return err
	}
	for k, v := range this.Header {
		req.Header.Set(k, v)
	}
	resp, err := this.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return nil
}

// HTTPDispatcher 适配 Dispatcher 接口
var _ Dispatcher = (*HTTPDispatcher)(nil)

type HTTPDispatcher struct {
	URL    string
	Method string
	Header map[string]string
	Client *http.Client
	topics []string
}

func NewHTTPDispatcher(url, method string, topics []string) *HTTPDispatcher {
	if method == "" {
		method = http.MethodPost
	}
	return &HTTPDispatcher{
		URL:    url,
		Method: method,
		Client: http.DefaultClient,
		topics: topics,
	}
}

func (this *HTTPDispatcher) Push(msg *types.Message) error {
	bs := msg.Payload
	req, err := http.NewRequest(this.Method, this.URL, bytes.NewReader(bs))
	if err != nil {
		return err
	}
	for k, v := range this.Header {
		req.Header.Set(k, v)
	}
	resp, err := this.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return nil
}

func (this *HTTPDispatcher) Close() error { return nil }

func (this *HTTPDispatcher) Topics() []string { return this.topics }
