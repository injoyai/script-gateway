import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Select, Button, Space, Tag, Switch, Tooltip, Empty, Input } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import { listTopics } from '../../services/dataFlowApi';

interface Props {
  open: boolean;
  viewerId: number | null;
  initialTopics: string[];
  onClose: () => void;
}

interface StreamMessage {
  id: string;
  topic: string;
  data: string;
  source?: string;
  timestamp?: number;
  receivedAt: number;
}

const MAX_MESSAGES = 500;

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

const tryFormatJSON = (s: string): string => {
  try {
    const obj = JSON.parse(s);
    return JSON.stringify(obj, null, 2);
  } catch {
    return s;
  }
};

const ViewerStreamModal: React.FC<Props> = ({ open, viewerId, initialTopics, onClose }) => {
  const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopics);
  const [topicOptions, setTopicOptions] = useState<{ label: string; value: string }[]>([]);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  // 同步外部传入的初始 topics
  useEffect(() => {
    if (open) {
      setSelectedTopics(initialTopics);
      setMessages([]);
      setPaused(false);
      pausedRef.current = false;
    }
  }, [open, viewerId]); // eslint-disable-line

  // 加载可选 topic 列表
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listTopics().then((topics) => {
      if (cancelled) return;
      const opts = topics.map((t) => ({ label: `${t.topic} (${t.depth})`, value: t.topic }));
      setTopicOptions(opts);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // 建立 WebSocket 连接
  useEffect(() => {
    if (!open || selectedTopics.length === 0) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 开发模式（CRA 默认 3000 端口）proxy 不支持 WebSocket，直连后端
    const isDev = window.location.port === '3000';
    const host = isDev ? '127.0.0.1:8200' : window.location.host;
    // 带上 viewer_id，便于后端把订阅者归属到该 viewer，前端节点徽章可正确匹配
    const viewerIdQuery = viewerId != null ? `&viewer_id=${viewerId}` : '';
    const url = `${protocol}//${host}/api/viewer/stream?topics=${encodeURIComponent(selectedTopics.join(','))}${viewerIdQuery}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (pausedRef.current) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'message') {
          const sm: StreamMessage = {
            id: msg.id || Math.random().toString(36).slice(2),
            topic: msg.topic,
            data: msg.data,
            source: msg.source,
            timestamp: msg.timestamp,
            receivedAt: Date.now(),
          };
          setMessages((prev) => {
            const next = [...prev, sm];
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
          });
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [open, selectedTopics, viewerId]);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && listRef.current && !paused) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, autoScroll, paused]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const exportMessages = useCallback(() => {
    const text = messages.map((m) => ({
      id: m.id,
      topic: m.topic,
      source: m.source,
      timestamp: m.timestamp,
      receivedAt: m.receivedAt,
      data: m.data,
    }));
    const blob = new Blob([JSON.stringify(text, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viewer-${viewerId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, viewerId]);

  const filteredMessages = filter
    ? messages.filter((m) => m.topic.includes(filter) || m.data.includes(filter))
    : messages;

  return (
    <Modal
      title={`订阅查看器 - 实时数据${viewerId ? ` (#${viewerId})` : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      {/* 顶部控制栏 */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          mode="tags"
          style={{ minWidth: 280, flex: 1 }}
          placeholder="选择或输入 topic"
          value={selectedTopics}
          onChange={setSelectedTopics}
          options={topicOptions}
          tokenSeparators={[',']}
        />
        <Tooltip title={paused ? '继续' : '暂停'}>
          <Button icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />} onClick={togglePause}>
            {paused ? '继续' : '暂停'}
          </Button>
        </Tooltip>
        <Tooltip title="清空">
          <Button icon={<ClearOutlined />} onClick={clearMessages}>清空</Button>
        </Tooltip>
        <Tooltip title="导出 JSON">
          <Button icon={<DownloadOutlined />} onClick={exportMessages}>导出</Button>
        </Tooltip>
        <Space size="small">
          <span style={{ fontSize: 12, color: '#888' }}>自动滚动</span>
          <Switch size="small" checked={autoScroll} onChange={setAutoScroll} />
        </Space>
      </div>

      {/* 过滤和统计 */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          allowClear
          placeholder="过滤 topic 或内容..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 240 }}
        />
        <Tag color={paused ? 'orange' : 'green'} style={{ margin: 0 }}>
          {paused ? '已暂停' : '实时中'}
        </Tag>
        <span style={{ fontSize: 12, color: '#888' }}>
          共 {messages.length} 条{filter ? ` / 过滤后 ${filteredMessages.length} 条` : ''}
        </span>
      </div>

      {/* 消息列表 */}
      <div
        ref={listRef}
        style={{
          height: 420,
          overflowY: 'auto',
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          padding: 8,
        }}
      >
        {filteredMessages.length === 0 ? (
          <Empty description={selectedTopics.length === 0 ? '请选择订阅的 topic' : '等待消息...'} style={{ marginTop: 120 }} />
        ) : (
          filteredMessages.map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 6,
                padding: '6px 8px',
                background: '#fff',
                border: '1px solid #f0f0f0',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{m.topic}</Tag>
                {m.source && <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>{m.source}</Tag>}
                <span style={{ color: '#999', fontSize: 11 }}>{formatTime(m.timestamp || m.receivedAt)}</span>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace', fontSize: 12, color: '#333' }}>
                {tryFormatJSON(m.data)}
              </pre>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

export default ViewerStreamModal;
