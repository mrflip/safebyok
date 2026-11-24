import sys
f, t = sys.argv[1], sys.argv[2]
s = open(f).read(); table = open(t).read().rstrip('\n')
start = s.index('const ChainCases: readonly ChainCase[] = [\n') + len('const ChainCases: readonly ChainCase[] = [\n')
end = s.index('\n]\n// --\n\n// == [Running a chain]')
open(f, 'w').write(s[:start] + table + s[end:])
