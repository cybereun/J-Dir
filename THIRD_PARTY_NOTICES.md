# Third-Party Notices / 오픈소스 사용 고지

J-Dir Copyright (c) 2026 Lebi_Cybereun

J-Dir는 아래의 오픈소스 소프트웨어를 사용합니다. 각 구성 요소의 저작권과 라이선스는
원 저작자에게 있으며, 아래에 원문 고지를 그대로 보존합니다.

J-Dir uses the open-source software listed below. Copyright and licensing of each
component remain with its original authors; their notices are preserved verbatim.

## 아이디어 출처 / Design reference (not a bundled dependency)

J-Dir의 문서 본문 검색 기능은 [@chrisryugj](https://github.com/chrisryugj)의
[Anything (Docufinder)](https://github.com/chrisryugj/Docufinder)의 사용 방식에서 아이디어를 얻어 별도로
구현했습니다. J-Dir 배포본에는 Anything의 소스 코드, 아이콘, 이미지, 브랜드 또는 문서를 포함하지 않으며,
이 고지는 Anything 저작물에 대한 사용 권한을 부여하지 않습니다. 저작권과 라이선스는 원 프로젝트에 있습니다.

The full-text search feature of J-Dir was implemented separately, inspired by how @chrisryugj's Anything
(Docufinder) is used. J-Dir does not bundle Anything's source code, icons, images, branding or documentation,
and this acknowledgement grants no rights to Anything's works; copyright and licensing remain with the original
project.

## 요약 / Summary

| 구성 요소 / Component | 저작권자 / Copyright | 라이선스 / License | J-Dir에서의 용도 / Used for |
|---|---|---|---|
| [kordoc](https://github.com/chrisryugj/kordoc) | chrisryugj | MIT | 문서 텍스트·표 파싱 (설치 파일의 `resources/jdir-parser.exe`에 포함) |
| OpenDataLoader PDF 알고리즘 (kordoc 내 파생 코드) | Hancom, Inc. | Apache-2.0 | PDF 표 감지 |
| hml-equation-parser (kordoc 내 파생 코드) | Open Bapul | Apache-2.0 | HWPX 수식 변환 |
| [rhwp / @rhwp/core](https://github.com/edwardkim/rhwp) | Edward Kim | MIT | HWP·HWPX 원본 레이아웃 렌더링 (WebAssembly) |
| [PDF.js (pdfjs-dist)](https://github.com/mozilla/pdf.js) | Mozilla Foundation | Apache-2.0 | PDF 원본 레이아웃 렌더링, 문서 파서 내 PDF 처리 |
| cfb | SheetJS LLC | Apache-2.0 | 구형 Office/HWP 문서 구조 읽기 (파서에 포함) |
| JSZip | Stuart Knightley 외 | MIT | zip 기반 문서 읽기 (파서에 포함) |
| @xmldom/xmldom, markdown-it, zod | 각 저작자 | MIT | 문서 파서 내부 의존성 |
| Node.js 런타임 | Node.js contributors | MIT | 문서 파서 실행 환경 (단일 실행 파일로 포장) |

문서 파서(`jdir-parser.exe`)는 kordoc과 위 의존 라이브러리를 하나의 실행 파일로 묶은 것입니다.
`jdir-parser.exe` bundles kordoc and the libraries above into a single executable.

---

## kordoc — MIT License (verbatim)

MIT License

Copyright (c) 2026 chrisryugj

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### kordoc NOTICE (verbatim)

kordoc
Copyright 2026 chrisryugj
Licensed under the MIT License

This project includes code derived from the following third-party works:

================================================================================

OpenDataLoader PDF (opendataloader-pdf)
https://github.com/opendataloader-project/opendataloader-pdf

Copyright 2025-2026 Hancom, Inc.
Licensed under the Apache License, Version 2.0

Used in:
- src/pdf/line-detector.ts — TableBorderBuilder algorithm (line-based table
  detection via PDF graphics commands, grid construction from line intersections)
- src/pdf/cluster-detector.ts — ClusterTableConsumer algorithm (cluster-based
  borderless table detection via text alignment patterns)

Modifications:
- TypeScript rewrite from Java/Kotlin
- pdfjs-dist v4/v5 compatibility layer
- Korean PDF-specific optimizations (character spacing, cell text merging)

You may obtain a copy of the Apache License at:
http://www.apache.org/licenses/LICENSE-2.0

================================================================================

hml-equation-parser
https://github.com/OpenBapul/hml-equation-parser

Copyright 2018 Open Bapul
Licensed under the Apache License, Version 2.0

Used in:
- src/hwpx/equation.ts — hmlToLatex() (HULK-style HWPX equation script →
  LaTeX) derived from hulkEqParser.py and hulkReplaceMethod.py

Modifications:
- TypeScript rewrite from Python 3
- Inlined convertMap.json as TS constants
- Graceful error handling so failed conversion drops the equation rather
  than leaking the HWP alt-text ("수식입니다") through the document

See THIRD_PARTY/hml-equation-parser.LICENSE for the full license text.

You may obtain a copy of the Apache License at:
http://www.apache.org/licenses/LICENSE-2.0

================================================================================

cfb (Compound File Binary)
https://github.com/SheetJS/js-cfb

Copyright 2013-present SheetJS LLC
Licensed under the Apache License, Version 2.0

Used as a dependency for HWP 5.x OLE2 container parsing.
No modifications — used as a bundled npm package.

================================================================================

pdfjs-dist (PDF.js)
https://github.com/mozilla/pdf.js

Copyright Mozilla Foundation
Licensed under the Apache License, Version 2.0

Used as an optional peer dependency for PDF text extraction.
No modifications — used as an npm package.

================================================================================

JSZip
https://github.com/Stuk/jszip

Copyright 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, Antonio Afonso
Dual-licensed under the MIT License OR GPL-3.0-or-later
This project uses JSZip under the MIT License.

Used for ZIP-based format parsing (HWPX, XLSX, DOCX).
No modifications — used as an npm package.

================================================================================

rhwp
https://github.com/edwardkim/rhwp

Copyright edwardkim
Licensed under the MIT License

Used in:
- src/hwp5/cfb-lenient.ts — LenientCfbReader algorithm (FAT/directory/mini-stream
  parsing for corrupted CFB containers)
- src/hwp5/crypto.ts — Distribution document decryption algorithm (AES key
  extraction from MSVC LCG-scrambled payload)

Modifications:
- TypeScript rewrite from Rust
- Added sector size validation, chain length limits, and cycle detection
- Pure JS AES-128 ECB implementation (no native dependency)

================================================================================

Pix2Text — Mathematical Formula Detection & Recognition
https://github.com/breezedeus/Pix2Text

Copyright 2023-2024 breezedeus
MFD (Mathematical Formula Detection): trained on Ultralytics YOLOv8 — MFD model
weights themselves are distributed under MIT via the HuggingFace repository
`breezedeus/pix2text-mfd`, but the underlying YOLOv8 architecture carries an
AGPL-3.0 license from Ultralytics. Users distributing derivative works built on
MFD outputs should review Ultralytics' licensing terms.
MFR (Mathematical Formula Recognition): HuggingFace `breezedeus/pix2text-mfr`,
MIT License.

Used in:
- src/pdf/formula/detector.ts — YOLOv8 letterbox preprocessing, NMS post-processing
- src/pdf/formula/recognizer.ts — DeiT encoder + TrOCR decoder greedy decoding
- src/pdf/formula/postprocess.ts — LaTeX output cleanup (derived from Pix2Text
  `latex_ocr.py` post_process)

Models are downloaded at runtime from HuggingFace with SHA-256 verification.
No model weights are redistributed with this package. Algorithm implementations
are original TypeScript ports referencing the Pix2Text algorithm descriptions.

You may obtain a copy of the MIT License at:
https://opensource.org/licenses/MIT

### OpenDataLoader PDF (kordoc THIRD_PARTY notice, verbatim)

OpenDataLoader PDF
Version: 2.2.0
Copyright 2025-2026 Hancom, Inc.
License: Apache License, Version 2.0
Source: https://github.com/opendataloader-project/opendataloader-pdf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

Usage in kordoc:
The PDF table border detection algorithm (src/pdf/line-detector.ts) is derived
from OpenDataLoader PDF's TableBorderBuilder. The algorithm was re-implemented
in TypeScript with modifications for pdfjs-dist compatibility and Korean
document optimization.

Modifications include:
- TypeScript implementation (original: Java)
- pdfjs-dist v4/v5 operator list parsing (original: Apache PDFBox)
- Korean text gap merging within table cells
- Adjacent grid merging for split table recovery
- Coordinate clustering with configurable tolerances

### hml-equation-parser (kordoc THIRD_PARTY notice, verbatim)

hml-equation-parser
Version: 0.1.2 (Python)
Copyright 2018 Open Bapul (OpenBapul/hml-equation-parser)
License: Apache License, Version 2.0
Source: https://github.com/OpenBapul/hml-equation-parser

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Full license text: hml-equation-parser.LICENSE

---

Usage in kordoc:
The HWPX equation script → LaTeX converter (src/hwpx/equation.ts) is derived
from hml-equation-parser's hulkEqParser.py and hulkReplaceMethod.py modules.
The algorithm was re-implemented in TypeScript with no material changes —
the 5-pass rewrite (frac → rootOf → matrix → bar → brace), the bracket-matching
helpers, and the three conversion maps (CONVERT_MAP, MIDDLE_CONVERT_MAP,
BAR/MATRIX/BRACE_CONVERT_MAP) are faithful ports of the original Python.

Modifications:
- TypeScript rewrite from Python 3
- Inlined convertMap.json as TS constants (resolveJsonModule kept optional)
- Added graceful fallback in the HWPX parser: if conversion throws, the
  equation is dropped instead of leaking the HWP alt-text ("수식입니다").

---

## rhwp / @rhwp/core — MIT License (verbatim)

MIT License

Copyright (c) 2025-2026 Edward Kim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Apache License 2.0 (full text)

아래 라이선스 전문은 PDF.js, cfb, OpenDataLoader PDF, hml-equation-parser에 적용됩니다.
The text below applies to PDF.js, cfb, OpenDataLoader PDF and hml-equation-parser.

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

---

각 구성 요소의 최신 저작권 고지와 전체 라이선스 조건은 해당 프로젝트 저장소를 참고하십시오.
For the latest notices and full terms, see each project's repository.
