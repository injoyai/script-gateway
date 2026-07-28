import { create } from 'zustand';

export type ScriptType = 'deal' | 'forward' | 'listener' | 'unknown';

interface ScriptEditorState {
  open: boolean;
  name: string;
  content: string;
  language: string;
  scriptType: ScriptType;
  onSave: ((content: string) => void | Promise<void>) | null;
  openEditor: (params: {
    name: string;
    content: string;
    language?: string;
    scriptType?: ScriptType;
    onSave?: (content: string) => void | Promise<void>;
  }) => void;
  close: () => void;
}

const useScriptEditorStore = create<ScriptEditorState>((set) => ({
  open: false,
  name: '',
  content: '',
  language: 'go',
  scriptType: 'unknown',
  onSave: null,
  openEditor: ({ name, content, language = 'go', scriptType = 'unknown', onSave = null }) =>
    set({ open: true, name, content, language, scriptType, onSave }),
  close: () => set({ open: false, name: '', content: '', language: 'go', scriptType: 'unknown', onSave: null }),
}));

export default useScriptEditorStore;
