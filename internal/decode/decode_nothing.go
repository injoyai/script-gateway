package decode

var _ Decoder = (*Nothing)(nil)

type Nothing struct{}

func (this *Nothing) Decode(bs []byte) (map[string]any, error) {
	return nil, nil
}
