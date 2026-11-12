# -*- coding: utf-8 -*-
"""Проверка отображения ДП (шаг «проверка отображения» раздела 9.1 ТЗ).
Рисует ДП по семантике канвы ТЗ (5.4): линии жизни, автонумерация стрелок,
рамки циклов и условных блоков с разделителем веток. Скриншот через Playwright.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_dp import ORIG, load_dap  # noqa: E402

OUT = Path('/home/z/my-project/download/e2e-sequences-v00201')
OUT.mkdir(parents=True, exist_ok=True)

COLW, HEAD_H, TOP_GAP, ROW_H, PAD = 180, 96, 16, 48, 28
INK, MUTE, LINE = '#1F2937', '#64748B', '#94A3B8'


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def render_html(dp, blocks):
    n_ll, n_ar = len(dp['lifelines']), len(dp['arrows'])
    W = PAD * 2 + n_ll * COLW
    H = HEAD_H + TOP_GAP + n_ar * ROW_H + 30
    col = {bid: PAD + i * COLW + COLW / 2 for i, bid in enumerate(dp['lifelines'])}
    row_y = lambda i: HEAD_H + TOP_GAP + i * ROW_H + ROW_H / 2  # noqa: E731
    idx = {a['id']: i for i, a in enumerate(dp['arrows'])}
    bl = {b['id']: b for b in dp['blocks']}
    starts = {b['arrows'][0]: b for b in dp['blocks']}
    ends = {b['arrows'][-1]: b for b in dp['blocks']}
    else_at = {b.get('elseFrom'): b for b in dp['blocks'] if b['kind'] == 'cond' and b.get('elseFrom')}
    in_block = {}
    for b in dp['blocks']:
        for i in range(idx[b['arrows'][0]], idx[b['arrows'][-1]] + 1):
            in_block[i] = b
    starts = {b['arrows'][0]: b for b in dp['blocks']}
    ends = {b['arrows'][-1]: b for b in dp['blocks']}
    else_at = {b.get('elseFrom'): b for b in dp['blocks'] if b['kind'] == 'cond' and b.get('elseFrom')}
    first_of_block = {idx[b['arrows'][0]] for b in dp['blocks']}

    def block_frame(b):
        i0, i1 = idx[b['arrows'][0]], idx[b['arrows'][-1]]
        xs = []
        for aid in b['arrows']:
            a = dp['arrows'][idx[aid]]
            xs += [col[a['from']], col[a['to']]]
        x0, x1 = min(xs) - COLW / 2 - 10, max(xs) + COLW / 2 + 10
        prev_bottom = row_y(i0 - 1) + 17 if i0 > 0 else -10**9
        y0 = max(row_y(i0) - ROW_H / 2 - 14, prev_bottom, HEAD_H + TOP_GAP - 6)
        y1 = row_y(i1) + ROW_H / 2 - 4
        if b['kind'] == 'loop':
            style, label = f'border:2px solid #B45309;background:#FFFBEB;', f'Цикл: {esc(b["name"])}'
            lab_c = '#92400E'
        elif b['kind'] == 'group':
            style, label = 'border:2px solid #64748B;background:#F8FAFC;', esc(b['name'])
            lab_c = '#334155'
        else:
            style, label = 'border:2px solid #64748B;background:#F8FAFC;', f'Если: {esc(b["name"])}'
            lab_c = '#334155'
        html = [f'<div style="position:absolute;left:{x0}px;top:{y0}px;width:{x1 - x0}px;height:{y1 - y0}px;'
                f'{style}border-radius:8px;"></div>']
        html.append(f'<div style="position:absolute;left:{x0 + 10}px;top:{y0 + 4}px;font-size:11px;font-weight:700;'
                    f'color:{lab_c};background:#fff;padding:1px 7px;border-radius:9px;'
                    f'border:1px solid {lab_c}22;">{label}</div>')
        if b['kind'] == 'cond' and b.get('elseFrom'):
            ei = idx[b['elseFrom']]
            yd = (row_y(ei - 1) + row_y(ei)) / 2
            html.append(f'<div style="position:absolute;left:{x0}px;top:{yd}px;width:{x1 - x0}px;'
                        f'border-top:2px dashed {LINE};"></div>')
            if b.get('thenLabel'):
                html.append(f'<div style="position:absolute;right:{W - x1 + 12}px;top:{y0 + 24}px;font-size:11px;'
                            f'color:{MUTE};background:#fff;padding:0 6px;border-radius:8px;">то: {esc(b["thenLabel"])}</div>')
            if b.get('elseLabel'):
                html.append(f'<div style="position:absolute;right:{W - x1 + 12}px;top:{yd + 5}px;font-size:11px;'
                            f'color:{MUTE};background:#fff;padding:0 6px;border-radius:8px;">иначе: {esc(b["elseLabel"])}</div>')
        return ''.join(html)

    parts = [f'<!doctype html><html><head><meta charset="utf-8"><style>'
             f'*{{margin:0;padding:0;box-sizing:border-box;font-family:"DejaVu Sans",sans-serif;}}'
             f'body{{background:#fff;}}</style></head>'
             f'<body style="width:{W}px;height:{H}px;position:relative;">']
    parts.append(f'<div style="position:absolute;left:{PAD}px;top:18px;font-size:17px;font-weight:700;color:{INK};">'
                 f'ДП «{esc(dp["name"])}»</div>')
    parts.append(f'<div style="position:absolute;left:{PAD}px;top:44px;font-size:12px;color:{MUTE};">'
                 f'{n_ll} линий жизни · {n_ar} стрелок · {len(dp["blocks"])} блока · проверка отображения (раздел 9.1 ТЗ v0.02.01)</div>')
    # блоки (фоны и рамки) под линиями жизни
    for b in dp['blocks']:
        parts.append(block_frame(b))
    # линии жизни
    for bid in dp['lifelines']:
        x, binfo = col[bid], blocks[bid]
        parts.append(f'<div style="position:absolute;left:{x - COLW / 2 + 6}px;top:{HEAD_H - HEAD_H + 64}px;width:{COLW - 12}px;'
                     f'height:{HEAD_H - 12}px;"></div>')
        badge = '<div style="font-size:10px;color:#fff;background:#94A3B8;display:inline-block;padding:0 7px;border-radius:8px;margin-top:3px;">внешняя</div>'
        parts.append(f'<div style="position:absolute;left:{x - COLW / 2 + 6}px;top:66px;width:{COLW - 12}px;'
                     f'text-align:center;font-size:11.5px;font-weight:700;color:{INK};line-height:1.25;">'
                     f'{esc(binfo["full"])}{badge if binfo["external"] else ""}</div>')
        parts.append(f'<div style="position:absolute;left:{x}px;top:{HEAD_H + TOP_GAP}px;height:'
                     f'{n_ar * ROW_H + 6}px;border-left:2px dashed {LINE};"></div>')
    # стрелки
    for i, a in enumerate(dp['arrows']):
        y = row_y(i)
        num = i + 1
        if a['from'] == a['to']:
            x = col[a['from']]
            parts.append(f'<div style="position:absolute;left:{x + 4}px;top:{y - 13}px;width:64px;height:26px;'
                         f'border:2px solid {INK};border-radius:13px;background:#fff;"></div>')
            parts.append(f'<div style="position:absolute;left:{x + 58}px;top:{y - 8}px;width:0;height:0;'
                         f'border-top:6px solid transparent;border-bottom:6px solid transparent;'
                         f'border-left:9px solid {INK};"></div>')
            parts.append(f'<div style="position:absolute;left:{x + 74}px;top:{y - 26}px;max-width:{W - x - 90}px;'
                         f'font-size:11.5px;color:{INK};background:#fff;padding:0 5px;">'
                         f'<b style="color:#B45309;">{num}.</b> {esc(a["label"])}</div>')
        else:
            x0, x1 = col[a['from']], col[a['to']]
            sgn = 1 if x1 > x0 else -1
            parts.append(f'<div style="position:absolute;left:{min(x0, x1)}px;top:{y - 1}px;'
                         f'width:{abs(x1 - x0)}px;border-top:2px solid {INK};"></div>')
            parts.append(f'<div style="position:absolute;left:{x1 - sgn * 10}px;top:{y - 7}px;width:0;height:0;'
                         f'border-top:6px solid transparent;border-bottom:6px solid transparent;'
                         f'border-left:{"9" if sgn > 0 else "0"}px solid {INK};'
                         f'border-right:{"0" if sgn > 0 else "9"}px solid {INK};"></div>')
            lw = abs(x1 - x0) - 20
            below = i in first_of_block  # первая стрелка блока — подпись и бейдж под линией, чтобы не задевать заголовок рамки
            ly = y + 5 if below else y - 24
            parts.append(f'<div style="position:absolute;left:{min(x0, x1) + 10}px;top:{ly}px;width:{lw}px;'
                         f'text-align:center;font-size:11.5px;color:{INK};white-space:nowrap;overflow:visible;">'
                         f'<span style="background:#fff;padding:0 5px;"><b style="color:#B45309;">{num}.</b> {esc(a["label"])}</span></div>')
            parts.append(f'<div style="position:absolute;left:{x0 - 9}px;top:{y + 2 if below else y - 9}px;width:18px;height:18px;'
                         f'border-radius:9px;background:{INK};color:#fff;font-size:10.5px;font-weight:700;'
                         f'text-align:center;line-height:18px;">{num}</div>')
    parts.append('</body></html>')
    return ''.join(parts), W, H


def main():
    _, blocks, _ = load_dap()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for n, dp in enumerate(ORIG, 1):
            html, W, H = render_html(dp, blocks)
            tmp = OUT / f'_tmp_seq{n}.html'
            tmp.write_text(html, encoding='utf-8')
            page = browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
            page.goto(tmp.as_uri())
            page.wait_for_timeout(250)
            target = OUT / f'display-seq-{n}.png'
            page.screenshot(path=str(target), full_page=True)
            page.close()
            tmp.unlink()
            print(f'отрисовано: {target.name} ({W}x{H} css px)')
        browser.close()


if __name__ == '__main__':
    main()
