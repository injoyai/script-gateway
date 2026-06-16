import { create } from 'zustand';

interface ScriptEditorState {
  open: boolean;
  name: string;
  content: string;
  language: string;
  onSave: ((content: string) => void | Promise<void>) | null;
  openEditor: (params: {
    name: string;
    content: string;
    language?: string;
    onSave?: (content: string) => void | Promise<void>;
  }) => void;
  close: () => void;
}

const useScriptEditorStore = create<ScriptEditorState>((set) => ({
  open: false,
  name: '',
  content: '',
  language: 'go',
  onSave: null,
  openEditor: ({ name, content, language = 'go', onSave = null }) =>
    set({ open: true, name, content, language, onSave }),
  close: () => set({ open: false, name: '', content: '', language: 'go', onSave: null }),
}));

export default useScriptEditorStore;
