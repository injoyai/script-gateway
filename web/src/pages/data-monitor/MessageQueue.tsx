import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Tag, Button, Space } from 'antd';
import { ReloadOutlined, InboxOutlined } from '@ant-design/icons';
import axios from 'axios';
import TopicLink from '../../components/TopicLink';
import useTopicMonitorStore from '../../store/useTopicMonitorStore';

interface TopicInfo {
  name: string;
  depth: number;
  subscribers: number;
}

const MessageQueue: React.FC = () => {
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const openTopic = useTopicMonitorStore((s) => s.openTopic);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/queue/topics');
      if (res.data?.code === 200) {
        setTopics(res.data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const topicColumns = [
    {
      title: 'Topic',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <TopicLink topic={text} color="blue" />,
    },
    {
      title: '深度',
      dataIndex: 'depth',
      key: 'depth',
      width: 120,
      render: (v: number) => <Tag color={v > 0 ? 'orange' : 'green'}>{v}</Tag>,
    },
    {
      title: '订阅者',
      dataIndex: 'subscribers',
      key: 'subscribers',
      width: 120,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <InboxOutlined />
            <span>Topic 列表</span>
          </Space>
        }
        bordered={false}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchTopics} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={topicColumns}
          dataSource={topics}
          rowKey="name"
          loading={loading}
          pagination={{ pageSize: 20 }}
          size="middle"
          onRow={(record) => ({
            onClick: () => openTopic(record.name),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );
};

export default MessageQueue;
