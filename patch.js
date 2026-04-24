const fs = require('fs');
let html = fs.readFileSync('Index.html', 'utf8');

// 1. Add fabricMap
html = html.replace('let allImagesData = [];', 'let allImagesData = [];\n      let fabricMap = {};');

// 2. Add loadFactoryTabs call inside DOMContentLoaded
html = html.replace('loadImagesFromSheet();\n      });', 'loadImagesFromSheet();\n        loadFactoryTabs();\n        document.getElementById(\'color\').addEventListener(\'input\', () => autoFillNPL(null));\n      });');

// 3. Add loadFactoryTabs function
const loadFactoryTabsScript = `      function loadFactoryTabs() {
        const factoryTabs = ["TALYNO", "ANH THƯ", "AN NGUYÊN", "LC", "GLX", "GIFT"];
        let delay = 300; 
        factoryTabs.forEach((tab, index) => {
          window[\`processFactoryTab_\${index}\`] = function(json) {
            try {
              if (!json || !json.table) return;
              let styleNameIdx = -1, fabricIdx = -1, colorIdx = -1;
              if (json.table.cols) {
                  json.table.cols.forEach((col, idx) => {
                      if (col && col.label) {
                          const lbl = col.label.toUpperCase();
                          if ((lbl.includes('STYLE NAME') || lbl.includes('TÊN SP') || lbl.includes('TÊN MẪU')) && !lbl.includes('CODE') && !lbl.includes('MÃ')) styleNameIdx = idx;
                          if (lbl.includes('FABRIC') || lbl.replace(/\\s/g,'').includes('VẢI')) fabricIdx = idx;
                          if ((lbl.includes('COLOR') || lbl.includes('MÀU')) && !lbl.includes('CODE') && !lbl.includes('MÃ')) colorIdx = idx;
                      }
                  });
              }
              if (!json.table.rows) return;
              json.table.rows.forEach(row => {
                if (row && row.c) {
                  if (styleNameIdx === -1 || fabricIdx === -1 || colorIdx === -1) {
                    row.c.forEach((cell, idx) => {
                      if (cell && cell.v && typeof cell.v === 'string') {
                        const lbl = cell.v.toUpperCase();
                        if ((lbl.includes('STYLE NAME') || lbl.includes('TÊN SP') || lbl.includes('TÊN MẪU')) && !lbl.includes('CODE') && !lbl.includes('MÃ')) styleNameIdx = idx;
                        if (lbl.includes('FABRIC') || lbl.replace(/\\s/g,'').includes('VẢI')) fabricIdx = idx;
                        if ((lbl.includes('COLOR') || lbl.includes('MÀU')) && !lbl.includes('CODE') && !lbl.includes('MÃ')) colorIdx = idx;
                      }
                    });
                  }
                  if (styleNameIdx !== -1 && fabricIdx !== -1 && colorIdx !== -1) {
                    const styleNameCel = row.c[styleNameIdx];
                    const fabricCel = row.c[fabricIdx];
                    const colorCel = row.c[colorIdx];
                    if (styleNameCel && styleNameCel.v && fabricCel && fabricCel.v && colorCel && colorCel.v) {
                      const sName = styleNameCel.v.toString().trim().toUpperCase();
                      const fName = fabricCel.v.toString().trim();
                      const cName = colorCel.v.toString().trim().toUpperCase();
                      if (sName !== 'STYLE NAME' && sName !== 'TÊN SP' && sName !== 'TÊN MẪU') {
                        fabricMap[sName + '|' + cName] = fName;
                      }
                    }
                  }
                }
              });
            } catch(e) { console.error(e); }
          };
          setTimeout(() => {
              const script = document.createElement("script");
              script.src = \`https://docs.google.com/spreadsheets/d/1NbNxKCyZV_lTabuYwjLA27sqrANBZ55gVoLkKatVZOM/gviz/tq?sheet=\${encodeURIComponent(tab)}&tqx=responseHandler:processFactoryTab_\${index}\`;
              document.body.appendChild(script);
          }, delay);
          delay += 400;
        });
      }\n\n`;
html = html.replace('function processImagesData(json) {', loadFactoryTabsScript + '      function processImagesData(json) {');

const newAutoFillNPL = `      function autoFillNPL(poObj) {
         let po = poObj;
         if (!po || !po.maSP) {
           const inputVal = document.getElementById("artCode").value.trim();
           if (!inputVal) return;
           const searchCode = inputVal.split(" - ")[0].trim();
           po = allPOData.find(p => p.maSP.toUpperCase() === searchCode.toUpperCase());
         }
         if (!po) return;
         
         const colorInput = document.getElementById("color").value.trim().toUpperCase();
         const searchName = po.tenMau.toUpperCase();
         let isMapEmpty = Object.keys(fabricMap).length === 0;
         let matchedFabric = null;
         
         if (!isMapEmpty) {
             if (colorInput) {
                 const exactKey = searchName + "|" + colorInput;
                 if (fabricMap[exactKey]) {
                     matchedFabric = fabricMap[exactKey];
                 } else {
                     for (const key in fabricMap) {
                         const parts = key.split("|");
                         const kName = parts[0].trim().toUpperCase();
                         const kColor = parts[1].trim().toUpperCase();
                         const searchWords = searchName.split(/[-\\s]/);
                         let nameMatch = searchName === kName || searchName.includes(kName) || kName.includes(searchName);
                         if (!nameMatch) {
                              const kWords = kName.split(/[-\\s]/);
                              nameMatch = searchWords.some(sw => sw.length > 2 && kWords.includes(sw));
                         }
                         if (nameMatch && (kColor === colorInput || kColor.includes(colorInput) || colorInput.includes(kColor))) {
                             matchedFabric = fabricMap[key];
                             break;
                         }
                     }
                 }
             } else {
                 for (const key in fabricMap) {
                     const parts = key.split("|");
                     const kName = parts[0].trim().toUpperCase();
                     if (searchName === kName || searchName.includes(kName) || kName.includes(searchName)) {
                         matchedFabric = fabricMap[key];
                         break;
                     }
                 }
             }
         }
         let finalVal = matchedFabric;
         if (!finalVal) {
             if (isMapEmpty) finalVal = po.note + " (Chưa tải xong data xưởng)";
             else finalVal = po.note + " (Không tìm thấy Tên Mẫu trong data xưởng)";
         }
         document.getElementById("nplInfo").value = finalVal;
      }\n\n`;

if (html.includes('document.getElementById("nplInfo").value = po.note;')) {
    html = html.replace('if (document.getElementById("nplInfo").value === "") {\r\n               document.getElementById("nplInfo").value = po.note;\r\n            }', 'autoFillNPL(po);');
    html = html.replace('if (document.getElementById("nplInfo").value === "") {\n               document.getElementById("nplInfo").value = po.note;\n            }', 'autoFillNPL(po);');
}

// Add autoFill Image Links
if (!html.includes('imgUrlInput.value = imgRecord.link;')) {
    const oldImageStr = 'autoFillNPL(po);';
    const newImageStr = `autoFillNPL(po);
            
            // --- Auto-fill Link Hình Ảnh ---
            const imgUrlInput = document.getElementById("imageUrl");
            if (imgUrlInput) {
                const imgRecord = allImagesData.find(img => img.maSP.toUpperCase() === searchCode.toUpperCase() && img.mau === 'TRẮNG');
                if (imgRecord && imgRecord.link) {
                    imgUrlInput.value = imgRecord.link;
                }
            }`;
    html = html.replace(oldImageStr, newImageStr);
}

// Ensure processPartnersData placement
html = html.replace('function processPartnersData(json) {', newAutoFillNPL + '      function processPartnersData(json) {');

// Fix signature bug
html = html.replace('<div style="font-weight:bold">${supplier}</div>', '<div style="font-weight:bold">${supplier}${allPartnersData.find(p => p.tradeName === supplier) && allPartnersData.find(p => p.tradeName === supplier).representative ? \'<br><span style="font-weight:normal;font-size:12px;">\' + allPartnersData.find(p => p.tradeName === supplier).representative.replace(/\\\\n/g, \'<br>\') + \'</span>\' : \'\'}</div>');

// Remove contact parts from partnerAddress insertion
html = html.replace('addressStr += `${contactName} - ${phone}`;', '// addressStr += `${contactName} - ${phone}`;');

fs.writeFileSync('Index.html', html);
console.log('Patched');
