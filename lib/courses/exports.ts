import type { Lesson } from "./schema";
export const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export type DocumentContent = {
  title: string;
  sections: { title: string; body: string }[];
  answerKey?: string;
};
export function lessonDocument(title: string, lesson: Lesson): DocumentContent {
  return {
    title,
    sections: [
      { title: "Objetivos", body: lesson.objectives.join("\n") },
      ...lesson.scenes.map((s) => ({
        title: s.title,
        body: [
          ...s.steps,
          s.narration,
          s.code,
          s.columns.length
            ? [s.columns.join(" | "), ...s.rows.map((r) => r.join(" | "))].join(
                "\n",
              )
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      })),
      { title: "Práctica", body: lesson.exercise },
      ...(lesson.references.length
        ? [
            {
              title: "Referencias para verificar",
              body: lesson.references.join("\n"),
            },
          ]
        : []),
    ],
    answerKey: lesson.solution,
  };
}
export function documentHTML(
  doc: DocumentContent,
  answers = false,
  slides = false,
) {
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
    escape(doc.title) +
    "</title><style>body{font:16px/1.7 system-ui,sans-serif;color:#172638;max-width:860px;margin:40px auto;padding:24px}h1{color:#5b3fc1}h2{color:#176b79}p{white-space:pre-wrap;overflow-wrap:anywhere}section{break-inside:avoid;" +
    (slides ? "break-after:page;min-height:65vh;" : "") +
    "}header{border-bottom:3px solid #8c6ee8}@page{margin:18mm} @media print{body{margin:0;padding:0;font-size:12pt}}</style></head><body><header><h1>" +
    escape(doc.title) +
    "</h1></header>" +
    doc.sections
      .map(
        (s) =>
          "<section><h2>" +
          escape(s.title) +
          "</h2><p>" +
          escape(s.body) +
          "</p></section>",
      )
      .join("") +
    (answers && doc.answerKey
      ? "<section><h2>Solucionario · uso del docente</h2><p>" +
        escape(doc.answerKey) +
        "</p></section>"
      : "") +
    "</body></html>"
  );
}
const xml = (s: string) =>
  escape(s).replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, "");
export async function documentDOCX(doc: DocumentContent, answers = false) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const paragraph = (s: string, bold = false) =>
    "<w:p><w:r>" +
    (bold ? "<w:rPr><w:b/></w:rPr>" : "") +
    '<w:t xml:space="preserve">' +
    xml(s) +
    "</w:t></w:r></w:p>";
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      paragraph(doc.title, true) +
      doc.sections
        .map(
          (s) =>
            paragraph(s.title, true) +
            s.body
              .split("\n")
              .map((x) => paragraph(x))
              .join(""),
        )
        .join("") +
      (answers && doc.answerKey
        ? paragraph("Solucionario · uso del docente", true) +
          doc.answerKey
            .split("\n")
            .map((x) => paragraph(x))
            .join("")
        : "") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1020" w:bottom="1020" w:left="1020"/></w:sectPr></w:body></w:document>',
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
export function csv(columns: string[], rows: string[][]) {
  return (
    "\uFEFF" +
    [columns, ...rows]
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              (/^[=+@\-\t\r]/.test(v) ? "'" : "") +
              v.replace(/"/g, '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}

export async function documentPPTX(doc: DocumentContent) {
  const JSZip = (await import("jszip")).default,
    zip = new JSZip();
  const ns = "http://schemas.openxmlformats.org/presentationml/2006/main",
    a = "http://schemas.openxmlformats.org/drawingml/2006/main",
    r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    rel = "http://schemas.openxmlformats.org/package/2006/relationships";
  const prefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const relationship = (id: string, type: string, target: string) =>
    '<Relationship Id="' +
    id +
    '" Type="' +
    r +
    "/" +
    type +
    '" Target="' +
    target +
    '"/>';
  const rels = (body: string) =>
    prefix + '<Relationships xmlns="' + rel + '">' + body + "</Relationships>";
  const pages = [{ title: doc.title, body: "Cursos IA" }, ...doc.sections];
  const tree =
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const shape = (
    id: number,
    name: string,
    text: string,
    y: number,
    height: number,
    size: number,
    color: string,
  ) =>
    '<p:sp><p:nvSpPr><p:cNvPr id="' +
    id +
    '" name="' +
    name +
    '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="640000" y="' +
    y +
    '"/><a:ext cx="10912000" cy="' +
    height +
    '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
    text
      .split("\n")
      .map(
        (line) =>
          '<a:p><a:r><a:rPr lang="es-PE" sz="' +
          size +
          '"><a:solidFill><a:srgbClr val="' +
          color +
          '"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>' +
          xml(line) +
          "</a:t></a:r></a:p>",
      )
      .join("") +
    "</p:txBody></p:sp>";
  let types =
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
  for (const [path, type] of [
    ["presentation", "presentation.main"],
    ["slideMasters/slideMaster1", "slideMaster"],
    ["slideLayouts/slideLayout1", "slideLayout"],
  ])
    types +=
      '<Override PartName="/ppt/' +
      path +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.' +
      type +
      '+xml"/>';
  types +=
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    types +=
      '<Override PartName="/ppt/slides/slide' +
      (i + 1) +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    zip.file(
      "ppt/slides/slide" + (i + 1) + ".xml",
      prefix +
        '<p:sld xmlns:p="' +
        ns +
        '" xmlns:a="' +
        a +
        '" xmlns:r="' +
        r +
        '"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F6F7FC"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>' +
        tree +
        shape(2, "Título", p.title, 500000, 1000000, 3200, "6145AB") +
        shape(3, "Contenido", p.body, 1700000, 4400000, 2100, "24364B") +
        "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>",
    );
    zip.file(
      "ppt/slides/_rels/slide" + (i + 1) + ".xml.rels",
      rels(
        relationship("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"),
      ),
    );
  }
  zip.file(
    "[Content_Types].xml",
    prefix +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      types +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    rels(relationship("rId1", "officeDocument", "ppt/presentation.xml")),
  );
  zip.file(
    "ppt/presentation.xml",
    prefix +
      '<p:presentation xmlns:p="' +
      ns +
      '" xmlns:a="' +
      a +
      '" xmlns:r="' +
      r +
      '"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' +
      pages
        .map(
          (_, i) =>
            '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>',
        )
        .join("") +
      '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    rels(
      relationship("rId1", "slideMaster", "slideMasters/slideMaster1.xml") +
        pages
          .map((_, i) =>
            relationship(
              "rId" + (i + 2),
              "slide",
              "slides/slide" + (i + 1) + ".xml",
            ),
          )
          .join(""),
    ),
  );
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    prefix +
      '<p:sldMaster xmlns:p="' +
      ns +
      '" xmlns:a="' +
      a +
      '" xmlns:r="' +
      r +
      '"><p:cSld><p:spTree>' +
      tree +
      '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
  );
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    rels(
      relationship("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") +
        relationship("rId2", "theme", "../theme/theme1.xml"),
    ),
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    prefix +
      '<p:sldLayout xmlns:p="' +
      ns +
      '" xmlns:a="' +
      a +
      '" xmlns:r="' +
      r +
      '" type="blank"><p:cSld name="Vacía"><p:spTree>' +
      tree +
      "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  );
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    rels(
      relationship("rId1", "slideMaster", "../slideMasters/slideMaster1.xml"),
    ),
  );
  const colors: Record<string, string> = {
    dk1: "172638",
    lt1: "FFFFFF",
    dk2: "343058",
    lt2: "F6F7FC",
    accent1: "7955D4",
    accent2: "197D80",
    accent3: "E6AB58",
    accent4: "D5698B",
    accent5: "567FA9",
    accent6: "6DAE89",
    hlink: "7955D4",
    folHlink: "197D80",
  };
  zip.file(
    "ppt/theme/theme1.xml",
    prefix +
      '<a:theme xmlns:a="' +
      a +
      '" name="Cursos IA"><a:themeElements><a:clrScheme name="Cursos">' +
      Object.entries(colors)
        .map(
          ([k, v]) => "<a:" + k + '><a:srgbClr val="' + v + '"/></a:' + k + ">",
        )
        .join("") +
      '</a:clrScheme><a:fontScheme name="Cursos"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Cursos"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>',
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
