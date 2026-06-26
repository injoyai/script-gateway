import React, { useRef } from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/go/go';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/mode/shell/shell';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/css/css';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/display/placeholder';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import './CodeEditor.css';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  theme?: 'material' | 'monokai' | 'dracula';
  placeholder?: string;
  height?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'go',
  theme = 'material',
  placeholder = '在此编辑代码...',
  height = '100%',
}) => {
  const editorRef = useRef<any>(null);

  // 语言映射
  const languageMap: Record<string, string> = {
    go: 'go',
    golang: 'go',
    js: 'javascript',
    javascript: 'javascript',
    ts: 'javascript',
    typescript: 'javascript',
    py: 'python',
    python: 'python',
    sh: 'shell',
    bash: 'shell',
    json: 'javascript',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'xml',
    css: 'css',
    md: 'markdown',
  };

  const cmMode = languageMap[language.toLowerCase()] || 'go';

  // 主题映射
  const themeMap: Record<string, string> = {
    material: 'material',
    monokai: 'monokai',
    dracula: 'dracula',
  };

  const cmTheme = themeMap[theme] || 'material';

  // 根据主题设置容器背景色
  const getContainerStyle = () => {
    const themeColors: Record<string, string> = {
      material: '#263238',
      monokai: '#272822',
      dracula: '#282a36',
    };
    return {
      height,
      background: themeColors[cmTheme] || themeColors.material,
    };
  };

  // refresh 策略：覆盖 Modal 打开动画全程（antd v4 约 300ms）
  // 解决：1)动画期间容器尺寸变化导致闪烁 2)初始化时高度不对导致后半部分无高亮
  const scheduleRefresh = (editor: any) => {
    const doRefresh = () => {
      editor.refresh();
      editor.setSize('100%', '100%');
      // 重新设置 mode 强制对整个文档重新 tokenize，修复 viewportMargin 下尾部行无高亮
      editor.setOption('mode', cmMode);
    };
    requestAnimationFrame(doRefresh);
    setTimeout(doRefresh, 100);
    setTimeout(doRefresh, 300);
  };

  return (
    <div className="code-editor-container" style={getContainerStyle()}>
      <CodeMirror
        editorDidMount={(editor) => {
          editorRef.current = editor;
          editor.setSize('100%', '100%');
          scheduleRefresh(editor);
        }}
        value={value}
        options={{
          mode: cmMode,
          theme: cmTheme,
          lineNumbers: true,
          lineWrapping: true,
          indentUnit: 4,
          tabSize: 4,
          indentWithTabs: false,
          matchBrackets: true,
          autoCloseBrackets: true,
          styleActiveLine: { nonEmpty: true },
          viewportMargin: Infinity,
          placeholder: placeholder,
          spellcheck: false,
          autocorrect: false,
          autocapitalize: false,
          foldGutter: true,
          gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        }}
        onBeforeChange={(editor, data, val) => {
          onChange(val);
        }}
      />
    </div>
  );
};

export default CodeEditor;
