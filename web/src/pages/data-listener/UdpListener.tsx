import React from 'react';
import { Form, Input, InputNumber, Select, Switch, Tag } from 'antd';
import ListenerCrudPage, { ListenerItem, TopicColumn, OutTopicColumn } from '../../components/ListenerCrudPage';

const framingOptions = [
  { value: 'raw', label: '原始数据 (raw)' },
  { value: 'delimiter', label: '分隔符 (delimiter)' },
  { value: 'fixed_length', label: '固定长度 (fixed_length)' },
  { value: 'length_field', label: '长度字段 (length_field)' },
];

const parseExtra = (raw?: string) => {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

const UdpListener: React.FC = () => {
  return (
    <ListenerCrudPage
      endpoint="listener-conn"
      type="udp_conn"
      title="UDP 监听管理"
      addButtonText="添加 UDP 监听"
      modalWidth={700}
      getInitialValues={() => ({
        enable: true,
        address: '0.0.0.0:9001',
        framing_mode: 'raw',
        length_field_offset: 0,
        length_field_size: 2,
        length_field_endian: 'big',
        length_field_include_header: false,
      })}
      getEditFields={(record) => {
        const extra = parseExtra(record.extra);
        return {
          address: record.address || '',
          framing_mode: extra.framing?.mode || 'raw',
          delimiter: extra.framing?.delimiter,
          length: extra.framing?.length,
          length_field_offset: extra.framing?.offset ?? 0,
          length_field_size: extra.framing?.size ?? 2,
          length_field_endian: extra.framing?.endian || 'big',
          length_field_include_header: extra.framing?.include_header ?? false,
        };
      }}
      buildExtra={(values) => JSON.stringify({
        framing: {
          mode: values.framing_mode,
          delimiter: values.delimiter,
          length: values.length,
          offset: values.length_field_offset,
          size: values.length_field_size,
          endian: values.length_field_endian,
          include_header: values.length_field_include_header,
        },
      })}
      columns={[
        { title: '服务名称', dataIndex: 'name', key: 'name' },
        {
          title: '监听地址',
          key: 'address',
          render: (_: any, r: ListenerItem) => <Tag color="geekblue">{r.address || '-'}</Tag>,
        },
        {
          title: '分包模式',
          key: 'framing',
          render: (_: any, r: ListenerItem) => {
            const extra = parseExtra(r.extra);
            return <Tag>{extra.framing?.mode || 'raw'}</Tag>;
          },
        },
        TopicColumn,
        OutTopicColumn,
      ]}
      renderExtraFields={() => (
        <>
          <Form.Item name="address" label="监听地址" rules={[{ required: true, message: '请输入监听地址' }]} tooltip="格式 host:port，host 留空或 0.0.0.0 表示所有网卡">
            <Input placeholder="0.0.0.0:9001" />
          </Form.Item>
          <Form.Item name="framing_mode" label="分包模式">
            <Select options={framingOptions} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => getFieldValue('framing_mode') === 'delimiter' ? (
              <Form.Item name="delimiter" label="分隔符" rules={[{ required: true, message: '请输入分隔符' }]} tooltip="支持 \n、\r\n、\t、\\ 转义">
                <Input placeholder="\n 或 \r\n" />
              </Form.Item>
            ) : null}
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => getFieldValue('framing_mode') === 'fixed_length' ? (
              <Form.Item name="length" label="固定长度" rules={[{ required: true, message: '请输入固定长度' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => getFieldValue('framing_mode') === 'length_field' ? (
              <>
                <Form.Item name="length_field_offset" label="长度字段偏移" tooltip="从报文开头算起，长度字段起始字节位置">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="length_field_size" label="长度字段字节数" rules={[{ required: true, message: '请选择长度字段字节数' }]}>
                  <Select options={[{ value: 1, label: '1 字节' }, { value: 2, label: '2 字节' }, { value: 4, label: '4 字节' }]} />
                </Form.Item>
                <Form.Item name="length_field_endian" label="字节序">
                  <Select options={[{ value: 'big', label: '大端 (big endian)' }, { value: 'little', label: '小端 (little endian)' }]} />
                </Form.Item>
                <Form.Item name="length_field_include_header" label="输出包含头部" valuePropName="checked" tooltip="开启后，输出帧中保留长度字段及其之前的头部字节">
                  <Switch />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
        </>
      )}
    />
  );
};

export default UdpListener;
