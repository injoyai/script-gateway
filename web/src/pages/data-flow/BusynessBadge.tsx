import React from 'react';
import { Tooltip } from 'antd';
import type { BusynessBadgeData } from '../../services/busynessApi';

// 根据繁忙度返回颜色：0-30 绿色 / 30-70 橙色 / 70-100 红色
const colorFor = (busyness: number): string => {
  if (busyness >= 70) return '#ff4d4f';
  if (busyness >= 30) return '#faad14';
  return '#52c41a';
};

// 格式化最近一次丢包时间
const formatDropTime = (lastDropAt: number): string => {
  if (lastDropAt === 0) return '无';
  const ms = lastDropAt / 1e6;
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s 前`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m 前`;
  return new Date(ms).toLocaleTimeString();
};

interface Props {
  data?: BusynessBadgeData;
}

// 节点繁忙度徽章：右上角圆形气泡 + 悬停详情
const BusynessBadge: React.FC<Props> = ({ data }) => {
  if (!data) return null;
  // 无容量（非队列节点）且无任何活动 -> 不显示
  if (data.cap === 0 && data.droppedTotal === 0 && data.enqueuedTotal === 0) return null;

  const color = colorFor(data.busyness);
  const tooltipContent = (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div>队列深度：{data.depth} / {data.cap}</div>
      <div>入队：{data.enqueuedTotal}，出队：{data.dequeuedTotal}</div>
      <div style={{ color: data.droppedTotal > 0 ? '#ffccc7' : 'inherit' }}>
        丢弃：{data.droppedTotal}（{formatDropTime(data.lastDropAt)}）
      </div>
      <div>速率：in {data.inRate.toFixed(1)}/s，out {data.outRate.toFixed(1)}/s</div>
      <div>订阅数：{data.subCount}</div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottom">
      <div
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          background: '#fff',
          border: `1.5px solid ${color}`,
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 600,
          color,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          zIndex: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
          }}
        />
        {Math.round(data.busyness)}%
        {data.droppedTotal > 0 && (
          <span style={{ color: '#ff4d4f', marginLeft: 2 }}>丢{data.droppedTotal}</span>
        )}
      </div>
    </Tooltip>
  );
};

export default BusynessBadge;
