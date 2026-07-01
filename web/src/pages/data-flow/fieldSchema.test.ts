import { flattenToForm, buildFromForm, getSchema, NODE_FIELD_SCHEMAS } from './fieldSchema';

describe('fieldSchema flatten/build', () => {
  it('getSchema 返回 listener http_server parent schema', () => {
    const s = getSchema('listenerParent', 'http_server');
    expect(s).toBeDefined();
    expect(s!.fields.find(f => f.key === 'port')).toBeDefined();
  });

  it('getSchema 返回 listener http_route conn schema', () => {
    const s = getSchema('listener', 'http_route');
    expect(s).toBeDefined();
    expect(s!.fields.find(f => f.key === 'path')).toBeDefined();
  });

  it('flattenToForm 把 parent config.port 平铺到表单值', () => {
    const node = {
      id: 1, name: 'p', type: 'http_server', enable: true,
      config: JSON.stringify({ port: 8080 }),
    } as any;
    const formVals = flattenToForm('listenerParent', 'http_server', node);
    expect(formVals.name).toBe('p');
    expect(formVals.port).toBe(8080);
  });

  it('buildFromForm 把表单 port 组装回 config JSON 字符串（parent http）', () => {
    const formVals = { name: 'p2', port: 9090 };
    const out = buildFromForm('listenerParent', 'http_server', formVals, { id: 1, enable: true, type: 'http_server' } as any);
    expect(out.name).toBe('p2');
    expect(out.config).toBe(JSON.stringify({ port: 9090 }));
  });

  it('buildFromForm conn http_route 含 path/methods 进 config', () => {
    const formVals = { name: 'r', topic: 't', out_topic: '', path: '/x', methods: 'POST' };
    const out = buildFromForm('listener', 'http_route', formVals, { id: 2, enable: true, type: 'http_route', parent_id: 1 } as any);
    const cfg = JSON.parse(out.config);
    expect(cfg.path).toBe('/x');
    expect(cfg.methods).toBe('POST');
    expect(cfg.pre_script).toBeUndefined();
    expect(out.pre_script).toBeUndefined();
  });

  it('buildFromForm conn plugin 把插件名和参数组装进 config', () => {
    const s = getSchema('listener', 'plugin');
    expect(s).toBeDefined();
    expect(s!.fields.find(f => f.key === 'plugin_name')).toBeDefined();
    expect(s!.fields.find(f => f.key === 'params')).toBeDefined();

    const formVals = { name: 'pl', topic: 'in', out_topic: 'out', plugin_name: 'demo', params: { interval: 1000 } };
    const out = buildFromForm('listener', 'plugin', formVals, { parent_id: 0, enable: false, type: 'plugin' } as any);
    const cfg = JSON.parse(out.config);
    expect(cfg.plugin_name).toBe('demo');
    expect(cfg.params).toEqual({ interval: 1000 });
  });

  it('getSchema 未知类型返回 undefined', () => {
    expect(getSchema('chain', 'chain')).toBeUndefined();
  });
});
