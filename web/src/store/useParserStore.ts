import { create } from 'zustand';

export interface ParserItem {
  id: string;
  name: string;
  enabled: boolean;
  script: string;
  description?: any;
}

interface ParserState {
  parsers: ParserItem[];
  addParser: (parser: ParserItem) => void;
  updateParser: (parser: ParserItem) => void;
  deleteParser: (id: string) => void;
}

const useParserStore = create<ParserState>((set) => ({
  parsers: [
    {
      id: '1',
      name: '通用JSON解析',
      enabled: true,
      script: `package main

import (
	"encoding/json"
	"fmt"
)

func Parse(data []byte) (interface{}, error) {
	var result map[string]interface{}
	err := json.Unmarshal(data, &result)
	if err != nil {
		return nil, err
	}
	return result, nil
}`,
    },
    {
      id: '2',
      name: '十六进制解析',
      enabled: true,
      script: `package main

import (
	"encoding/hex"
	"fmt"
)

func Parse(data []byte) (interface{}, error) {
	return hex.EncodeToString(data), nil
}`,
    },
  ],
  addParser: (parser) => set((state) => ({ parsers: [...state.parsers, parser] })),
  updateParser: (parser) =>
    set((state) => ({
      parsers: state.parsers.map((p) => (p.id === parser.id ? parser : p)),
    })),
  deleteParser: (id) =>
    set((state) => ({
      parsers: state.parsers.filter((p) => p.id !== id),
    })),
}));

export default useParserStore;
