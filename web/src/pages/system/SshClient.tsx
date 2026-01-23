import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Button, message, Card } from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import 'xterm/css/xterm.css';

const SshClient: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
      },
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      convertEol: true, // Help with newline handling for basic pipes
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    
    term.writeln('Welcome to Edge Gateway Local Terminal');
    term.writeln('Click "Connect" to start a local shell session.');
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (connected) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostUrl = window.location.host; 
    const url = `${protocol}//${hostUrl}/api/ssh/connect`;
    
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnected(true);
        xtermRef.current?.reset();
        xtermRef.current?.writeln(`Connecting to local system...`);
        fitAddonRef.current?.fit();
        message.success('Session started');
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          xtermRef.current?.write(event.data);
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            xtermRef.current?.write(reader.result as string);
          };
          reader.readAsText(event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        xtermRef.current?.writeln(`\r\nWebSocket Error`);
        message.error('Connection error');
      };

      ws.onclose = () => {
        setConnected(false);
        xtermRef.current?.writeln(`\r\nSession closed.`);
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (err) {
      message.error('Failed to create WebSocket connection');
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card bodyStyle={{ padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>Local System Terminal</div>
        <Button 
          type={connected ? "primary" : "primary"} 
          danger={connected}
          onClick={handleConnect}
          icon={connected ? <StopOutlined /> : <PlayCircleOutlined />}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </Button>
      </Card>
      
      <div 
        style={{ 
          flex: 1,
          padding: 10, 
          backgroundColor: '#1e1e1e',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
};

export default SshClient;
