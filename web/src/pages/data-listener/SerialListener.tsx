import React from 'react';
import { Form, Input, InputNumber, Select, Switch, Tag } from 'antd';
import ListenerCrudPage, { ListenerItem, TopicColumn, OutTopicColumn } from '../../components/ListenerCrudPage';

const COMMON_BAUD_RATES = [
  { value: 1200, label: '1200' },
  { value: 2400, label: '2400' },
  { value: 4800, label: '4800' },
  { value: 9600, label: '9600' },
  { value: 19200, label: '19200' },
  { value: 38400, label: '38400' },
  { value: 57600, label: '57600' },
  { value: 115200, label: '115200' },
];

const framingOptions = [
  { value: 'raw', label: 'raw' },
  { value: 'delimiter', label: 'delimiter' },
  { value: 'fixed_length', label: 'fixed_length' },
  { value: 'length_field', label: 'length_field' },
];

const parseExtra = (raw?: string) => {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

const SerialListener: React.FC = () => {
  return (
    <ListenerCrudPage
      endpoint="listener-conn"
      type="serial_conn"
      title="串口监听管理"
      addButtonText="添加串口监听"
      modalWidth={700}
      getInitialValues={() => ({
        enable: true,
        port: 'COM1',
        baud_rate: 9600,
        framing_mode: 'raw',
        length_field_offset: 0,
        length_field_size: 2,
        length_field_endian: 'big',
        length_field_include_header: false,
      })}
      getEditFields={(record) => {
        const extra = parseExtra(record.extra);
        return {
          port: record.port || '',
          baud_rate: record.baud_rate || 9600,
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
          title: '串口号',
          key: 'port',
          render: (_: any, r: ListenerItem) => <Tag color="geekblue">{r.port || '-'}</Tag>,
        },
        {
          title: '波特率',
          key: 'baud_rate',
          render: (_: any, r: ListenerItem) => <Tag>{r.baud_rate || '-'}</Tag>,
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
          <Form.Item name="port" label="串口号" rules={[{ required: true, message: '请输入串口号' }]} tooltip="Windows: COM1, COM2 ...   Linux: /dev/ttyUSB0, /dev/ttyS0 ...">
            <Input placeholder="COM1 或 /dev/ttyUSB0" />
          </Form.Item>
          <Form.Item name="baud_rate" label="波特率" rules={[{ required: true, message: '请选择波特率' }]}>
            <Select options={COMMON_BAUD_RATES} placeholder="9600" />
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

export default SerialListener;
