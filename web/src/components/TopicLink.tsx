import React from 'react';
import { Tag, Tooltip } from 'antd';
import useTopicMonitorStore from '../store/useTopicMonitorStore';

interface TopicLinkProps {
  topic?: string;
  color?: string;
  emptyText?: string;
}

const TopicLink: React.FC<TopicLinkProps> = ({ topic, color = 'green', emptyText = '未设置' }) => {
  const openTopic = useTopicMonitorStore((s) => s.openTopic);

  if (!topic) {
    return <span style={{ color: 'var(--ink-3)' }}>{emptyText}</span>;
  }

  return (
    <Tooltip title="点击查看实时消息">
      <Tag
        color={color}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={(e) => {
          e.stopPropagation();
          openTopic(topic);
        }}
      >
        {topic}
      </Tag>
    </Tooltip>
  );
};

export default TopicLink;
