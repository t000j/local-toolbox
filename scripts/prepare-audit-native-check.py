"""Prepare a small Rust verification crate; never mutate production sources.

Windows `cargo check --tests` compiles the three changed IO modules and their
real tests, omitting only Tauri's command-registration attribute. Linux
`cargo test` executes the production pure preview comparator/serde tests only.
Neither mode is full Tauri compilation or Windows filesystem execution.
"""
from pathlib import Path
import tomllib

repo = Path(__file__).resolve().parents[1]
target = repo / '.local-tools/audit-native-check'
(target / 'src').mkdir(parents=True, exist_ok=True)
versions = {p['name']: p['version'] for p in tomllib.loads((repo / 'src-tauri/Cargo.lock').read_text())['package']}
(target / 'Cargo.toml').write_text(
    '[package]\nname="toolbox-audit-native-check"\nversion="0.0.0"\nedition="2021"\n\n'
    '[dependencies]\n'
    f'serde={{version="={versions["serde"]}",features=["derive"]}}\n'
    f'serde_json="={versions["serde_json"]}"\n'
    f'base64="={versions["base64"]}"\n'
    '[target.\'cfg(windows)\'.dependencies]\n'
    f'image={{version="={versions["image"]}",default-features=false,features=["png"]}}\n'
)
for name in ['file_rename', 'safe_file_io', 'screenshot']:
    source = (repo / f'src-tauri/src/{name}.rs').read_text()
    (target / f'src/{name}.rs').write_text(source.replace('#[tauri::command]\n', ''))
scan = (repo / 'src-tauri/src/file_scan.rs').read_text()
component = 'pub(crate) fn valid_component' + scan.split('pub(crate) fn valid_component', 1)[1].split('\nfn validate', 1)[0]
rename = (repo / 'src-tauri/src/file_rename.rs').read_text()
preview = '#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]' + rename.split('#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]', 1)[1].split('#[derive(Serialize, Deserialize, Clone)]', 1)[0]
comparator = 'fn verify_confirmed_previews' + rename.split('fn verify_confirmed_previews', 1)[1].split('#[tauri::command]', 1)[0]
tests = '#[cfg(test)]\nmod audit_tests' + rename.split('#[cfg(test)]\nmod audit_tests', 1)[1]
(target / 'src/rename_plan_portable.rs').write_text('use serde::{Deserialize, Serialize};\n' + preview + comparator + tests)
(target / 'src/lib.rs').write_text(
    '#![allow(dead_code)]\n#[cfg(windows)] mod file_scan {\n' + component + '\n}\n'
    '#[cfg(windows)] mod safe_file_io;\n#[cfg(windows)] mod file_rename;\n#[cfg(windows)] mod screenshot;\n'
    '#[cfg(not(windows))] mod rename_plan_portable;\n'
)
print(f'Prepared {target}; production function bodies preserved, no Windows effects performed.')
