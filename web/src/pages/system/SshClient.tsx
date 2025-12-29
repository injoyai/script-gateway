import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const SshClient: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln('Welcome to Edge Gateway SSH Terminal');
    term.writeln('Connecting to localhost...');
    term.writeln('Connected.');
    term.write('$ ');

    xtermRef.current = term;

    // Simple echo simulation
    let currentLine = '';
    term.onData((data) => {
      const code = data.charCodeAt(0);
      if (code === 13) { // Enter
        term.write('\r\n');
        if (currentLine.trim() === 'exit') {
          term.writeln('Logout');
        } else if (currentLine.trim() === 'help') {
          term.writeln('Available commands: help, clear, exit');
        } else if (currentLine.trim() === 'clear') {
          term.clear();
        } else if (currentLine.trim() !== '') {
          term.writeln(`command not found: ${currentLine}`);
        }
        term.write('$ ');
        currentLine = '';
      } else if (code === 127) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  return (
    <div 
      style={{ 
        height: 'calc(100vh - 200px)', 
        padding: 10, 
        backgroundColor: '#1e1e1e',
        borderRadius: 4
      }}
    >
      <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default SshClient;
