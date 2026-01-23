package push

import (
	"bytes"
	"io"
	"net/http"

	"github.com/injoyai/conv"
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

func (this *HTTP) Push(msg any) error {
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
	// Read body to reuse connection
	io.Copy(io.Discard, resp.Body)
	return nil
}
