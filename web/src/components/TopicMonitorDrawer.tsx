import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer, Empty, Space, Switch, Button, Tag, InputNumber, Tooltip, Table } from 'antd';
import { ReloadOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import useTopicMonitorStore from '../store/useTopicMonitorStore';

interface QueueMessage {
  id: string;
  topic: string;
  payload: string;
  metadata: Record<string, any>;
}

const formatPayload = (payload: string): string => {
  if (!payload) return '';
  try {
    const decoded = atob(payload);
    if (/^[\x20-\x7E\u4e00-\u9fff\r\n\t]+$/.test(decoded)) {
      try {
        const obj = JSON.parse(decoded);
        return JSON.stringify(obj, null, 2);
      } catch {
        return decoded;
      }
    }
  } catch {
    // ignore
  }
  try {
    const obj = JSON.parse(payload);
    return JSON.stringify(obj, null, 2);
  } catch {
    return payload.length > 500 ? payload.substring(0, 500) + '...' : payload;
  }
};

const formatTime = (metadata: Record<string, any>) => {
  const ts = metadata?.timestamp;
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
};

const TopicMonitorDrawer: React.FC = () => {
  const open = useTopicMonitorStore((s) => s.open);
  const topic = useTopicMonitorStore((s) => s.topic);
  const close = useTopicMonitorStore((s) => s.close);

  const [messages, setMessages] = useState<QueueMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [interval, setIntervalSec] = useState(2);
  const [limit, setLimit] = useState(50);
  const timerRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/queue/messages', {
        params: { topic, limit },
      });
      if (res.data?.code === 200) {
        const raw: any[] = res.data.data || [];
        setMessages(
          raw.map((m) => ({
            id: m.id || '',
            topic: m.topic || '',
            payload: typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload),
            metadata: m.metadata || {},
          }))
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [topic, limit]);

  // 打开/切换 topic 时立即加载一次
  useEffect(() => {
    if (open && topic) {
      fetchMessages();
    } else if (!open) {
      setMessages([]);
    }
  }, [open, topic, fetchMessages]);

  // 自动刷新
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (open && autoRefresh && topic) {
      timerRef.current = setInterval(() => {
        fetchMessages();
      }, Math.max(500, interval * 1000));
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, autoRefresh, interval, topic, fetchMessages]);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 110,
      ellipsis: true,
    },
    {
      title: 'Payload',
      dataIndex: 'payload',
      key: 'payload',
      render: (text: string) => (
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            maxHeight: 120,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {formatPayload(text)}
        </pre>
      ),
    },
    {
      title: '来源',
      key: 'source',
      width: 90,
      render: (_: any, record: QueueMessage) => record.metadata?.source || '-',
    },
    {
      title: '时间',
      key: 'time',
      width: 180,
      render: (_: any, record: QueueMessage) => formatTime(record.metadata),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <span>Topic 实时监听</span>
          {topic && <Tag color="blue">{topic}</Tag>}
        </Space>
      }
      placement="right"
      width={760}
      open={open}
      onClose={close}
      closeIcon={<CloseOutlined />}
      destroyOnClose
      extra={
        <Space size="middle">
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>条数</span>
          <InputNumber
            min={1}
            max={500}
            value={limit}
            onChange={(v) => setLimit(Number(v) || 50)}
            size="small"
            style={{ width: 70 }}
          />
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>间隔(秒)</span>
          <InputNumber
            min={1}
            max={60}
            value={interval}
            onChange={(v) => setIntervalSec(Number(v) || 2)}
            size="small"
            style={{ width: 60 }}
            disabled={!autoRefresh}
          />
          <Tooltip title={autoRefresh ? '关闭自动刷新' : '开启自动刷新'}>
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              checkedChildren="自动"
              unCheckedChildren="手动"
            />
          </Tooltip>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={fetchMessages}>
            刷新
          </Button>
        </Space>
      }
    >
      {!topic ? (
        <Empty description="请选择一个 Topic" />
      ) : (
        <Table
          columns={columns}
          dataSource={messages}
          rowKey={(r, idx) => `${r.id}-${idx}`}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ y: 'calc(100vh - 220px)' }}
        />
      )}
    </Drawer>
  );
};

export default TopicMonitorDrawer;
