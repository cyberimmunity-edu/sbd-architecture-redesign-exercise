# -*- coding: utf-8 -*-
"""
Эталонный прототип сквозного сценария приёмки (раздел 9.1 ТЗ v0.02.01).
Проверяет форматы ДП (sequences.yaml, PlantUML, state.yaml) и круговой обмен
ДО реализации инструмента; правок кода приложения не вносит.

Шаги: валидация ДП по связям ДАП (П-3) -> экспорт -> контроль файлов ->
импорт (матчинг 7.3) -> сравнение с оригиналом -> отчёт.
"""
import re
import sys
import copy
import yaml
from pathlib import Path

ROOT = Path('/home/z/my-project')
UPLOAD_STATE = ROOT / 'upload' / 'state (3).yaml'
OUT = ROOT / 'download' / 'e2e-sequences-v00201'
OUT.mkdir(parents=True, exist_ok=True)

ERRORS: list[str] = []
WARNS: list[str] = []


def fail(msg: str):
    ERRORS.append(msg)
    print(f'  [E] {msg}')


def warn(msg: str):
    WARNS.append(msg)
    print(f'  [W] {msg}')


def ok(msg: str):
    print(f'  [OK] {msg}')


# ─────────────────────────────── ДАП ───────────────────────────────

def load_dap():
    data = yaml.safe_load(UPLOAD_STATE.read_text(encoding='utf-8'))
    arch = data['architecture']
    blocks = {b['id']: {'name': b['name'], 'external': bool(b.get('external')),
                        'trusted': bool(b.get('trusted'))} for b in arch['blocks']}
    # Ф-30: автонумерация внутренних доменов по порядку объявления
    n = 0
    for b in arch['blocks']:
        if not b.get('external'):
            n += 1
            blocks[b['id']]['number'] = n
            blocks[b['id']]['full'] = f'{n:02d}. {b["name"]}'
        else:
            blocks[b['id']]['full'] = b['name']
    edges = {(e['from'], e['to']): e['id'] for e in arch['edges']}
    return data, blocks, edges


# ─────────────────────────── ДП (оригиналы) ───────────────────────────

SEQ1 = {
    'id': 'seq-1',
    'name': 'Удалённое обновление прошивки',
    'lifelines': ['ext-shore', 'ext-2', 'blk-radio', 'blk-ota', 'dom-5',
                  'blk-nav', 'blk-ai', 'dom-2', 'dom-7'],
    'arrows': [
        {'id': 'a-1',  'from': 'ext-shore', 'to': 'ext-2',    'label': 'передача пакетов обновления прошивки'},
        {'id': 'a-2',  'from': 'ext-2',     'to': 'blk-radio', 'label': 'ретрансляция пакетов обновления'},
        {'id': 'a-3',  'from': 'blk-radio', 'to': 'blk-ota',   'label': 'пакеты обновлений (OTA)'},
        {'id': 'a-4',  'from': 'blk-ota',   'to': 'dom-5',     'label': 'образ прошивки на верификацию'},
        {'id': 'a-5',  'from': 'dom-5',     'to': 'dom-5',     'label': 'контроль подлинности образа (подпись, сертификат)'},
        {'id': 'a-6',  'from': 'dom-5',     'to': 'dom-5',     'label': 'применение верифицированной прошивки'},
        {'id': 'a-7',  'from': 'blk-ota',   'to': 'blk-nav',   'label': 'установленная прошивка'},
        {'id': 'a-8',  'from': 'blk-ota',   'to': 'blk-ai',    'label': 'обновление моделей ИИ'},
        {'id': 'a-9',  'from': 'dom-5',     'to': 'dom-5',     'label': 'обновление отклонено — нарушение подлинности'},
        {'id': 'a-10', 'from': 'dom-2',     'to': 'dom-7',     'label': 'регистрация события безопасности'},
        {'id': 'a-11', 'from': 'dom-7',     'to': 'blk-radio', 'label': 'тревога о нарушении подлинности прошивки'},
        {'id': 'a-12', 'from': 'blk-radio', 'to': 'ext-2',     'label': 'передача тревоги в радиоэфир'},
        {'id': 'a-13', 'from': 'ext-2',     'to': 'ext-shore', 'label': 'доставка тревоги береговому посту'},
    ],
    'blocks': [
        {'id': 'g-1', 'kind': 'loop', 'name': 'до получения полного образа',
         'color': '#F9A825', 'arrows': ['a-1', 'a-2', 'a-3']},
        {'id': 'g-2', 'kind': 'cond', 'name': 'подлинность прошивки подтверждена',
         'thenLabel': 'нормальное обновление', 'elseLabel': 'нарушение подлинности',
         'elseFrom': 'a-9', 'arrows': ['a-6', 'a-7', 'a-8', 'a-9', 'a-10', 'a-11', 'a-12', 'a-13']},
    ],
}

SEQ2 = {
    'id': 'seq-2',
    'name': 'Выполнение новой миссии',
    'lifelines': ['ext-shore', 'ext-2', 'blk-radio', 'ext-lock', 'dom-2', 'blk-nav',
                  'dom-3', 'dom-4', 'blk-cargo', 'dom-6', 'dom-7', 'dom-8'],
    'arrows': [
        {'id': 'a-1',  'from': 'ext-shore', 'to': 'ext-2',     'label': 'задание на новую миссию'},
        {'id': 'a-2',  'from': 'ext-2',     'to': 'blk-radio', 'label': 'приём задания миссии'},
        {'id': 'a-3',  'from': 'blk-radio', 'to': 'blk-nav',   'label': 'очищенные данные: задание миссии'},
        {'id': 'a-4',  'from': 'dom-2',     'to': 'dom-2',     'label': 'контроль подлинности миссии'},
        {'id': 'a-5',  'from': 'blk-nav',   'to': 'dom-3',     'label': 'данные курса и позиции'},
        {'id': 'a-6',  'from': 'dom-3',     'to': 'dom-3',     'label': 'комплексирование и контроль целостности навигационных данных'},
        {'id': 'a-7',  'from': 'blk-nav',   'to': 'blk-cargo', 'label': 'маршрутный лист'},
        {'id': 'a-8',  'from': 'blk-radio', 'to': 'ext-lock',  'label': 'заявка на шлюзование'},
        {'id': 'a-9',  'from': 'ext-lock',  'to': 'blk-radio', 'label': 'разрешение шлюзования'},
        {'id': 'a-10', 'from': 'blk-cargo', 'to': 'blk-radio', 'label': 'статус груза'},
        {'id': 'a-11', 'from': 'blk-radio', 'to': 'ext-2',     'label': 'статус миссии и груза'},
        {'id': 'a-12', 'from': 'ext-2',     'to': 'ext-shore', 'label': 'отчёт о выполнении миссии'},
        {'id': 'a-13', 'from': 'dom-3',     'to': 'dom-4',     'label': 'признак критического нарушения системы управления'},
        {'id': 'a-14', 'from': 'dom-4',     'to': 'dom-4',     'label': 'экстренное торможение'},
        {'id': 'a-15', 'from': 'dom-2',     'to': 'dom-7',     'label': 'регистрация события безопасности: критическое нарушение'},
        {'id': 'a-16', 'from': 'dom-7',     'to': 'blk-cargo', 'label': 'сигнал безопасности на остановку'},
        {'id': 'a-17', 'from': 'blk-cargo', 'to': 'dom-6',     'label': 'критичная команда: аварийная остановка'},
        {'id': 'a-18', 'from': 'dom-6',     'to': 'dom-8',     'label': 'блокировка движения (аварийная остановка)'},
        {'id': 'a-19', 'from': 'dom-7',     'to': 'blk-radio', 'label': 'тревога о критическом нарушении'},
        {'id': 'a-20', 'from': 'blk-radio', 'to': 'ext-2',     'label': 'передача тревоги'},
        {'id': 'a-21', 'from': 'ext-2',     'to': 'ext-shore', 'label': 'оповещение берегового поста'},
    ],
    'blocks': [
        {'id': 'g-1', 'kind': 'loop', 'name': 'контроль обстановки по ходу миссии',
         'color': '#1976D2', 'arrows': ['a-5', 'a-6']},
        {'id': 'g-2', 'kind': 'cond', 'name': 'критических нарушений в системе управления не выявлено',
         'thenLabel': 'нормальное выполнение миссии', 'elseLabel': 'аварийная остановка',
         'elseFrom': 'a-13', 'arrows': [f'a-{i}' for i in range(7, 22)]},
    ],
}

ORIG = [copy.deepcopy(SEQ1), copy.deepcopy(SEQ2)]


# ────────────────────── Шаг 1. Валидация ДП (П-3, 6.1) ──────────────────────

def validate(dps, blocks, edges, title='Валидация оригиналов'):
    print(f'\n== {title} ==')
    problems = 0
    for dp in dps:
        print(f'ДП «{dp["name"]}» ({len(dp["lifelines"])} линий жизни, {len(dp["arrows"])} стрелок, {len(dp["blocks"])} блоков)')
        seen = set()
        for ll in dp['lifelines']:
            if ll in seen:
                fail(f'{dp["id"]}: повтор линии жизни {ll} (E-структура)')
                problems += 1
            seen.add(ll)
            if ll not in blocks:
                fail(f'{dp["id"]}: участник {ll} отсутствует на ДАП (П-12)')
                problems += 1
        idx = {a['id']: i for i, a in enumerate(dp['arrows'])}
        for a in dp['arrows']:
            for k in ('from', 'to'):
                if a[k] not in seen:
                    fail(f'{dp["id"]}: {a["id"]} ссылается на неучастника {a[k]} (E-604)')
                    problems += 1
            if a['from'] != a['to'] and (a['from'], a['to']) not in edges:
                fail(f'{dp["id"]}: стрелка {a["id"]} ({a["from"]} → {a["to"]}) не является связью ДАП с этим направлением (E-601, П-3)')
                problems += 1
        used = set()
        for blk in dp['blocks']:
            ids = blk['arrows']
            nums = sorted(idx[i] for i in ids)
            if nums != list(range(nums[0], nums[0] + len(nums))):
                fail(f'{dp["id"]}: блок {blk["id"]} не из подряд идущих стрелок (E-605)')
                problems += 1
            for i in ids:
                if i in used:
                    fail(f'{dp["id"]}: блоки пересекаются на стрелке {i} (E-605)')
                    problems += 1
                used.add(i)
            if blk['kind'] == 'group' and len(ids) < 2:
                fail(f'{dp["id"]}: группа {blk["id"]} менее двух стрелок (E-605)')
                problems += 1
            if blk['kind'] == 'cond':
                ei = idx.get(blk.get('elseFrom', ''))
                if ei is None or not (nums[0] < ei <= nums[-1]):
                    fail(f'{dp["id"]}: граница ветки «иначе» блока {blk["id"]} вне диапазона (E-605)')
                    problems += 1
                elif ei == nums[0] or ei == nums[-1] + 1:
                    fail(f'{dp["id"]}: пустая ветка условного блока {blk["id"]} (редактор запрещает, П-14)')
                    problems += 1
        if len(dp['lifelines']) > 24 or len(dp['arrows']) > 100 or len(dp['blocks']) > 10:
            fail(f'{dp["id"]}: превышены лимиты Ф-58')
            problems += 1
    if problems == 0:
        ok('все стрелки (кроме self) соответствуют связям ДАП с точным направлением (П-3); блоки корректны; лимиты соблюдены')
    return problems


# ──────────────────────── Шаг 2. Экспорт ────────────────────────

def export_yaml(dps, blocks):
    used = []
    for dp in dps:
        for ll in dp['lifelines']:
            if ll not in used:
                used.append(ll)
    doc = {
        'version': 1,
        'domains': {bid: blocks[bid]['full'] for bid in used},
        'sequences': [{
            'id': dp['id'], 'name': dp['name'],
            'lifelines': list(dp['lifelines']),
            'arrows': [dict(a) for a in dp['arrows']],
            'blocks': [dict(b) for b in dp['blocks']],
        } for dp in dps],
    }
    path = OUT / 'sequences.yaml'
    path.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
    return path


def export_puml(dp, blocks):
    lines = ['@startuml', 'autonumber']
    for ll in dp['lifelines']:
        stereo = ' <<external>>' if blocks[ll]['external'] else ''
        lines.append(f'participant "{blocks[ll]["full"]}" as {ll}{stereo}')
    lines.append('')
    # блоки: рамка открывается на первой стрелке, else на границе, end после последней
    starts = {b['arrows'][0]: b for b in dp['blocks']}
    ends = {b['arrows'][-1]: b for b in dp['blocks']}
    else_at = {b['elseFrom']: b for b in dp['blocks'] if b['kind'] == 'cond' and b.get('elseFrom')}
    for a in dp['arrows']:
        b = starts.get(a['id'])
        if b:
            if b['kind'] == 'loop':
                lines.append(f'loop {b["name"]} {b["color"]}'.rstrip())
            elif b['kind'] == 'group':
                lines.append(f'group {b["name"]} {b["color"]}'.rstrip())
            elif b['kind'] == 'cond':
                then = f' ({b["thenLabel"]})' if b.get('thenLabel') else ''
                lines.append(f'if ({b["name"]}) then{then}')
        b = else_at.get(a['id'])
        if b:
            lab = f' ({b["elseLabel"]})' if b.get('elseLabel') else ''
            lines.append(f'else{lab}')
        label = f' : {a["label"]}' if a.get('label') else ''
        lines.append(f'{a["from"]} -> {a["to"]}{label}')
        b = ends.get(a['id'])
        if b and b['kind'] in ('loop', 'group'):
            lines.append('end')
        # end условного блока — после последней стрелки блока
        if b and b['kind'] == 'cond':
            lines.append('end')
    lines.append('@enduml')
    path = OUT / f'{dp["name"]}.puml'
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return path


def export_state(dap_data, dps):
    doc = copy.deepcopy(dap_data)
    doc['sequences'] = [{
        'id': dp['id'], 'name': dp['name'],
        'lifelines': list(dp['lifelines']),
        'arrows': [dict(a) for a in dp['arrows']],
        'blocks': [dict(b) for b in dp['blocks']],
    } for dp in dps]
    path = OUT / 'state_vessel_with_sequences.yaml'
    path.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
    return path


# ──────────────── Шаг 3/4. Матчинг 7.3 и импорт ────────────────

def make_matcher(blocks):
    by_number = {v['number']: k for k, v in blocks.items() if not v['external']}
    no_prefix = {v['name']: k for k, v in blocks.items() if not v['external']}

    def match(s: str):
        s = s.strip()
        if s in blocks:                                     # 1. id
            return s, None
        m = re.match(r'^(\d+)\.\s+(.*)$', s)                # 2. номер «NN.»
        if m and int(m.group(1)) in by_number:
            bid = by_number[int(m.group(1))]
            rest = m.group(2)
            base = blocks[bid]['name']
            if rest == base:
                return bid, None
            warn(f'W-007: участник «{s}» принят по номеру; название в проекте: «{blocks[bid]["full"]}»')
            return bid, 'W-007'
        if s in {v['full'] for v in blocks.values()}:       # 3. точное полное
            return next(k for k, v in blocks.items() if v['full'] == s), None
        if s in no_prefix:                                  # 3б. имя без префикса
            return no_prefix[s], None
        low = s.lower()                                     # 4. подстрока
        cands = [k for k, v in blocks.items() if low in v['name'].lower()]
        if len(cands) == 1:
            return cands[0], None
        if len(cands) > 1:
            raise ValueError(f'E-606: «{s}» сопоставляется с несколькими доменами')
        raise ValueError(f'E-602: участник «{s}» не сопоставлен с доменом ДАП')
    return match


def import_yaml_doc(doc, blocks, from_state=False):
    match = make_matcher(blocks)
    dmap = doc.get('domains', {})
    out = []
    for seq in doc['sequences']:
        ll = []
        for x in seq['lifelines']:
            bid, _ = match(x)
            ll.append(bid)
        arrows = []
        for a in seq['arrows']:
            arrows.append({'id': a['id'],
                           'from': match(a['from'])[0] if not from_state else a['from'],
                           'to': match(a['to'])[0] if not from_state else a['to'],
                           'label': a.get('label')})
        blk = []
        for b in seq.get('blocks', []):
            blk.append({'id': b['id'], 'kind': b['kind'], 'name': b['name'],
                        'color': b.get('color'),
                        'thenLabel': b.get('thenLabel'), 'elseLabel': b.get('elseLabel'),
                        'elseFrom': b.get('elseFrom'), 'arrows': list(b['arrows'])})
        out.append({'id': seq['id'], 'name': seq['name'], 'lifelines': ll,
                    'arrows': arrows, 'blocks': blk})
    return out


IGNORE_RE = re.compile(
    r"^(autonumber\b|title\b|skinparam\b|scale\b|hide\b|show\b|caption\b|legend\b|footer\b|header\b|"
    r"activate\b|deactivate\b|destroy\b|==|')")

ARROW_RE = re.compile(r'^(?P<f>[\w-]+)\s*(?P<op>->>|->|-->|<--|<-)\s*(?P<t>[\w-]+)\s*(?::\s*(?P<label>.*))?$')
PART_RE = re.compile(r'^(participant|actor)\s+(?:"(?P<q>[^"]+)"|(?P<bare>[\w-]+))'
                     r'(?:\s+as\s+(?P<alias>[\w-]+))?')
BLOCK_RE = re.compile(r'^(group|loop)\s+(?P<rest>.+)$')
IF_RE = re.compile(r'^if\s*\((?P<cond>[^)]*)\)\s*then\s*(?:\((?P<then>[^)]*)\))?\s*$')
ELSE_RE = re.compile(r'^else\s*(?:\((?P<label>[^)]*)\))?\s*$')
COLOR_RE = re.compile(r'\s#([0-9A-Fa-f]{6})\s*$')


def import_puml(path, blocks):
    match = make_matcher(blocks)
    text = path.read_text(encoding='utf-8')
    lines = text.splitlines()
    if not (lines and lines[0].strip() == '@startuml' and lines[-1].strip() == '@enduml'):
        raise ValueError('E-608: отсутствует @startuml или @enduml')
    parts: dict[str, str] = {}          # alias -> display name
    disp_seen: set[str] = set()
    arrows = []
    open_blocks: list[dict] = []
    for raw in lines[1:-1]:
        line = raw.strip()
        if not line:
            continue
        if IGNORE_RE.match(line):
            continue
        m = PART_RE.match(line)
        if m:
            disp = m.group('q') if m.group('q') is not None else m.group('bare')
            alias = m.group('alias') or disp
            if alias in parts or disp in disp_seen:
                raise ValueError(f'E-603: дубликат участника «{disp}»')
            bid, _ = match(disp)
            parts[alias] = bid
            disp_seen.add(disp)
            continue
        m = BLOCK_RE.match(line)
        if m:
            if open_blocks:
                warn(f'W-002: вложенный блок «{line}» — заголовок игнорируется, стрелки относятся к внешнему блоку')
                continue
            kind = 'group' if m.group(1) == 'group' else 'loop'
            rest = m.group('rest')
            cm = COLOR_RE.search(rest)
            color = f'#{cm.group(1)}' if cm else None
            name = COLOR_RE.sub('', rest).strip()
            open_blocks.append({'kind': kind, 'name': name, 'color': color,
                                'start': len(arrows), 'arrows': []})
            continue
        if IF_RE.match(line):
            if open_blocks:
                warn(f'W-002: вложенный блок «{line}» — заголовок игнорируется')
                continue
            g = IF_RE.match(line)
            open_blocks.append({'kind': 'cond', 'name': g.group('cond').strip(),
                                'thenLabel': (g.group('then') or '').strip() or None,
                                'start': len(arrows), 'arrows': [], 'in_else': False})
            continue
        if ELSE_RE.match(line):
            if not open_blocks:
                raise ValueError(f'E-609: «else» вне открытого блока: «{line}»')
            top = open_blocks[-1]
            if top['kind'] != 'cond' or top['in_else']:
                warn(f'W-002: «{line}» вне условного блока — игнорируется')
                continue
            top['in_else'] = True
            top['elseLabel'] = (ELSE_RE.match(line).group('label') or '').strip() or None
            top['elseFrom_idx'] = len(arrows)
            continue
        if line == 'end':
            if not open_blocks:
                raise ValueError('E-609: «end» вне открытого блока')
            b = open_blocks.pop()
            b['arrows'] = [a['id'] for a in arrows[b['start']:]]
            if b['kind'] == 'cond':
                b['elseFrom'] = arrows[b['elseFrom_idx']]['id'] if b.get('in_else') else None
            b.pop('start', None); b.pop('in_else', None); b.pop('elseFrom_idx', None)
            if not b['arrows']:
                continue
            arrows[-1].setdefault('_close', []).append(b)
            continue
        m = ARROW_RE.match(line)
        if m:
            f, t = m.group('f'), m.group('t')
            if f not in parts or t not in parts:
                raise ValueError(f'E-604: ссылка на необъявленного участника: «{line}»')
            a = {'id': f'a-{len(arrows) + 1}',
                 'from': parts[f] if m.group('op') in ('->', '->>', '-->') else parts[t],
                 'to': parts[t] if m.group('op') in ('->', '->>', '-->') else parts[f],
                 'label': (m.group('label') or '').strip() or None}
            arrows.append(a)
            continue
        if line.startswith(('note ', 'box ', '!')):
            warn(f'W-002: конструкция вне подмножества: «{line.split()[0]}…» (пропущена)')
            continue
        raise ValueError(f'E-607: строка PlantUML не распознана: «{line}»')
    if open_blocks:
        raise ValueError('E-609: не закрыт блок ' + ', '.join(b['kind'] for b in open_blocks))
    # раскладываем блоки по ДП (id — по первой стрелке)
    blocks_out = []
    for i, a in enumerate(arrows):
        for b in a.pop('_close', []):
            b['id'] = f'g-{len(blocks_out) + 1}'
            blocks_out.append(b)
    return [{'id': 'seq-1', 'name': path.stem, 'lifelines': [parts[k] for k in parts],
             'arrows': arrows, 'blocks': blocks_out}]


# ──────────────────── Шаг 5. Сравнение с оригиналом ────────────────────

def canon(dp):
    idx = {a['id']: i for i, a in enumerate(dp['arrows'])}
    return {
        'lifelines': list(dp['lifelines']),
        'arrows': [(a['from'], a['to'], a.get('label')) for a in dp['arrows']],
        'blocks': sorted([
            (b['kind'], b['name'], b.get('color'), b.get('thenLabel'), b.get('elseLabel'),
             idx.get(b.get('elseFrom')), tuple(idx[i] for i in b['arrows']))
            for b in dp['blocks'] if b.get('arrows')
        ]),
    }


def compare(imp, orig, tag):
    print(f'\n== Сравнение {tag} с оригиналом ==')
    diffs = 0
    if len(imp) != len(orig):
        fail(f'{tag}: число ДП {len(imp)} != {len(orig)}')
        return 1
    for a, b in zip(imp, orig):
        ca, cb = canon(a), canon(b)
        name = b['name']
        if ca == cb:
            ok(f'«{name}»: линии жизни, порядок, стрелки (from/to/подписи) и блоки совпадают полностью')
        else:
            diffs += 1
            if ca['lifelines'] != cb['lifelines']:
                fail(f'«{name}»: различие линий жизни: {ca["lifelines"]} vs {cb["lifelines"]}')
            if ca['arrows'] != cb['arrows']:
                for i, (x, y) in enumerate(zip(ca['arrows'], cb['arrows'])):
                    if x != y:
                        fail(f'«{name}»: стрелка {i + 1}: {x} vs {y}')
            if ca['blocks'] != cb['blocks']:
                fail(f'«{name}»: различие блоков: {ca["blocks"]} vs {cb["blocks"]}')
    return diffs


def revalidate(dps, blocks, edges, tag):
    print(f'\n== «Проверить ДП» после импорта ({tag}) ==')
    global ERRORS
    saved = ERRORS
    ERRORS = []
    validate(dps, blocks, edges, title=f'валидатор ДП ({tag})')
    problems = len(ERRORS)
    ERRORS = saved
    return problems


# ─────────────────────────── main ───────────────────────────

def main():
    dap_data, blocks, edges = load_dap()
    print(f'ДАП загружена: {len(blocks)} блоков '
          f'({sum(1 for v in blocks.values() if not v["external"])} внутренних, '
          f'{sum(1 for v in blocks.values() if v["external"])} внешних), {len(edges)} связей')

    p1 = validate(ORIG, blocks, edges)

    print('\n== Экспорт ==')
    yaml_path = export_yaml(ORIG, blocks)
    puml1 = export_puml(SEQ1, blocks)
    puml2 = export_puml(SEQ2, blocks)
    state_path = export_state(dap_data, ORIG)
    ok(f'sequences.yaml: {yaml_path.name}')
    ok(f'PlantUML: {puml1.name}, {puml2.name}')
    ok(f'state.yaml с секцией sequences: {state_path.name}')

    print('\n== Контроль экспортированных файлов ==')
    doc = yaml.safe_load(yaml_path.read_text(encoding='utf-8'))
    assert doc['version'] == 1 and len(doc['sequences']) == 2
    for bid, full in doc['domains'].items():
        assert blocks[bid]['full'] == full, f'справочник domains: {bid}'
    ok('sequences.yaml: схема, версия, справочник полных названий с номерами — корректны')
    for p in (puml1, puml2):
        txt = p.read_text(encoding='utf-8')
        for token in ('@startuml', '@enduml', 'autonumber', 'loop ', 'if (', 'else (', 'end'):
            assert token in txt, f'{p.name}: нет «{token}»'
        n_ext = txt.count('<<external>>')
        ok(f'{p.name}: структура рамок и участников корректна (внешних: {n_ext})')

    print('\n== Импорт (матчинг по разделу 7.3) ==')
    imp_yaml = import_yaml_doc(doc, blocks)
    imp_s1 = import_puml(puml1, blocks)
    imp_s2 = import_puml(puml2, blocks)
    state_doc = yaml.safe_load(state_path.read_text(encoding='utf-8'))
    imp_state = import_yaml_doc({'sequences': state_doc['sequences']}, blocks, from_state=True)

    d1 = compare(imp_yaml, ORIG, 'sequences.yaml')
    d2 = compare(imp_s1 + imp_s2, ORIG, 'PlantUML')
    d3 = compare(imp_state, ORIG, 'state.yaml (loadState)')
    p_re = revalidate(imp_yaml, blocks, edges, 'после импорта YAML') \
         + revalidate(imp_s1 + imp_s2, blocks, edges, 'после импорта PlantUML')

    total = p1 + d1 + d2 + d3 + p_re
    print(f'\n==== ИТОГ: {"ПРОЙДЕН" if total == 0 else "ЕСТЬ РАСХОЖДЕНИЯ"} '
          f'(ошибок: {total}, предупреждений: {len(WARNS)}) ====')
    return 0 if total == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
