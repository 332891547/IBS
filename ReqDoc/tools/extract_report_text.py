"""从 vTESTstudio 报告 PDF 中提取纯文本。

用途：`Report_IBSTest.pdf` 是加密/压缩的 PDF，无法用记事本或普通工具读取。
本脚本直接解码其中的 FlateDecode 流，并用字体的 ToUnicode 映射还原中文与英文文本，
输出可搜索的纯文本，便于定位失败判据。

用法：
    python extract_report_text.py <报告.pdf> <输出.txt>

示例：
    python extract_report_text.py D:\\Report_IBSTest.pdf  C:\\temp\\report.txt

已知限制（实测）：
  1. 报告使用子集化 CIDFontType2 字体，ToUnicode 只映射实际用到的字形，
     少量字符会丢失（例如数字 1、字母 I/J 偶有缺失），读出的文本需结合上下文判断。
  2. 只处理 FlateDecode 流；其它滤镜或图像型 PDF 不适用。
  3. 加密的 .vtestreport（二进制）不能直接解析，需先在 vTESTstudio 里导出为 PDF 或 XML。

来源：2026-11 在 IBSTest 工程排查休眠电流用例失败原因时编写，验证可用。
"""

import re
import sys
import zlib


def read_objects(data):
    """把 PDF 拆成 {对象号: 对象体}。"""
    objs = {}
    for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj(.*?)endobj', data, re.S):
        objs[int(m.group(1))] = m.group(3)
    return objs


def get_stream(body):
    """取出对象里的 stream 并解 FlateDecode。"""
    m = re.search(rb'stream\r?\n', body)
    if not m:
        return None
    start = m.end()
    end = body.find(b'endstream', start)
    raw = body[start:end]
    if raw.endswith(b'\r\n'):
        raw = raw[:-2]
    elif raw.endswith(b'\n') or raw.endswith(b'\r'):
        raw = raw[:-1]
    try:
        return zlib.decompress(raw)
    except Exception:
        return raw


def parse_cmap(b):
    """解析 ToUnicode CMap：字形码 -> Unicode 字符。"""
    mp = {}
    for blk in re.finditer(rb'beginbfchar(.*?)endbfchar', b, re.S):
        for p in re.finditer(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk.group(1)):
            code = int(p.group(1), 16)
            h = p.group(2).decode()
            mp[code] = ''.join(
                chr(int(h[i:i + 4], 16)) for i in range(0, len(h), 4) if len(h[i:i + 4]) == 4
            )
    for blk in re.finditer(rb'beginbfrange(.*?)endbfrange', b, re.S):
        for r in re.finditer(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk.group(1)):
            lo = int(r.group(1), 16)
            hi = int(r.group(2), 16)
            dst = int(r.group(3), 16)
            for c in range(lo, min(hi, lo + 4096) + 1):
                mp[c] = chr(dst + (c - lo))
    return mp


def decode_content(content, cmap):
    """把内容流里的十六进制字符串和字面量字符串按 CMap 还原成文本。"""
    out = []
    for m in re.finditer(rb'<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\()])*)\)', content):
        if m.group(1) is not None:
            hx = re.sub(rb'\s', b'', m.group(1))
            if len(hx) % 4 == 0 and hx:
                out.append(''.join(cmap.get(int(hx[i:i + 4], 16), '') for i in range(0, len(hx), 4)))
        else:
            s = m.group(2)
            s = s.replace(b'\\(', b'(').replace(b'\\)', b')').replace(b'\\\\', b'\\')
            out.append(s.decode('latin-1', 'ignore'))
    return ''.join(out)


def extract(pdf_path):
    data = open(pdf_path, 'rb').read()
    objs = read_objects(data)

    # Type0 字体对象 -> 对应 CMap
    type0 = {}
    for num, body in objs.items():
        m = re.search(rb'/ToUnicode\s+(\d+)\s+0\s+R', body)
        if m:
            st = get_stream(objs.get(int(m.group(1)), b''))
            if st:
                type0[num] = parse_cmap(st)

    # 资源名（/F0、/F1 ...）-> CMap
    res = {}
    for num, body in objs.items():
        for fm in re.finditer(rb'/(F\d+)\s+(\d+)\s+0\s+R', body):
            name = fm.group(1).decode()
            fnum = int(fm.group(2))
            if fnum in type0:
                res[name] = type0[fnum]

    # 逐个内容流解码，取能解出最多文本的字体作为该页字体
    pages = []
    for num, body in objs.items():
        st = get_stream(body) if b'stream' in body else None
        if not st or b'BT' not in st:
            continue
        best = ''
        for cmap in res.values():
            t = decode_content(st, cmap)
            if len(t) > len(best):
                best = t
        if best.strip():
            pages.append(best)

    return '\n\n===== PAGE SPLIT =====\n\n'.join(pages)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    text = extract(sys.argv[1])
    open(sys.argv[2], 'w', encoding='utf-8').write(text)
    print(f'extracted {len(text)} chars -> {sys.argv[2]}')