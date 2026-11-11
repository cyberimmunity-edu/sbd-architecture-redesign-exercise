# Восстановление Makefile после нормализации табуляций при правках:
# 1) рецепты с 8 ведущих пробелов -> табуляция (кроме продолжения .PHONY);
# 2) восстановление цветовых кодов \033[36m / \033[0m в цели help.
from pathlib import Path

p = Path('/home/z/my-project/Makefile')
text = p.read_text(encoding='utf-8')
lines = text.split('\n')

# границы блока .PHONY (переменная с продолжениями через обратный слеш)
phony_end = -1
for i, l in enumerate(lines):
    if l.startswith('.PHONY:'):
        j = i
        while lines[j].endswith('\\'):
            j += 1
        phony_end = j
        break

out = []
for i, l in enumerate(lines):
    if l.startswith('        ') and not l.startswith('         ') and i > phony_end:
        # ровно 8 ведущих пробелов у строки-рецепта -> табуляция
        l = '\t' + l[8:]
    out.append(l)

text = '\n'.join(out)
# восстановление цветовых кодов, съеденных при правке
text = text.replace(
    '{printf "  \\033%-22s\\033 %s\\n"',
    '{printf "  \\033[36m%-22s\\033[0m %s\\n"',
)
p.write_text(text, encoding='utf-8', newline='\n')

# контроль
chk = p.read_text(encoding='utf-8').split('\n')
tabs = sum(1 for l in chk if l.startswith('\t'))
print('строк-рецептов с табом:', tabs)
for i, l in enumerate(chk[:20], 1):
    if l.startswith('\t') or 'printf' in l or l.startswith('.PHONY'):
        print(i, repr(l[:80]))
