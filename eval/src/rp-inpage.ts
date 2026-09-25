import { NodeRegistry, observe } from '../../extension/lib/observe';
const reg = new NodeRegistry();
(window as any).__ouro = {
  observe: () => observe(document, reg),
  fill: (id: string, v: string) => {
    const el = reg.get(id) as HTMLInputElement | undefined;
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
};
