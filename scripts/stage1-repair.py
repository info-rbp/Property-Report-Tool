from pathlib import Path
p = Path('scripts/verifyApiIntegration.sh')
s = p.read_text()
old = '"propertyAddress":"","inspectingAgent":"Integration Tester"'
assert s.count(old) == 1
s = s.replace(old, '"propertyAddress":"99 Integration Test Street, Perth WA 6000","inspectingAgent":"Integration Tester"')
p.write_text(s)
print('Corrected the acceptance fixture, preserving the required-address validation.')
