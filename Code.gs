const SPREADSHEET_ID = '1tH11Kr6tlG1sChsjMfP9LUN_aRfbqer0Gm9U2n7HK94';

/**
 * Kiểm tra đăng nhập
 */
function checkLogin(username, password) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let userSheet = ss.getSheetByName("users");
    
    // Khởi tạo sheet users nếu chưa có
    if (!userSheet) {
      userSheet = ss.insertSheet("users");
      userSheet.getRange(1, 1, 1, 2).setValues([["Username", "Password"]]);
      userSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#ead1dc");
      // Tạo tài khoản mặc định
      userSheet.appendRow(["admin", "admin"]);
      userSheet.setFrozenRows(1);
    }
    
    const data = userSheet.getDataRange().getValues();
    const u = String(username).trim();
    const p = String(password).trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === u && String(data[i][1]).trim() === p) {
        return {
          success: true,
          username: data[i][0]
        };
      }
    }
    return { success: false, message: "Sai tài khoản hoặc mật khẩu!" };
  } catch (err) {
    return { success: false, message: "Lỗi Server: " + err.toString() };
  }
}

function saveOrderData(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Lưu thông tin chung vào tab data_order
    let orderSheet = ss.getSheetByName("data_order");
    const ORDER_HEADERS = ["Thời gian lưu", "Mã đơn hàng", "Ngày đặt hàng", "Người tạo", "Công ty", "Nhà cung cấp", "Địa chỉ NCC", "Thuế VAT (%)", "Tổng tạm tính", "Tiền VAT", "Tổng cộng", "PO Tháng"];
    if (!orderSheet) {
      orderSheet = ss.insertSheet("data_order");
    }
    if (orderSheet.getLastRow() === 0 || String(orderSheet.getRange("A1").getValue()) !== "Thời gian lưu") {
      // Nếu dòng 1 có dữ liệu nhưng không phải là Tiêu đề (do lưu đè lúc trước), ta chèn thêm 1 dòng trống lên trên cùng
      if (orderSheet.getLastRow() > 0 && String(orderSheet.getRange("A1").getValue()) !== "") {
        orderSheet.insertRowBefore(1);
      }
    }
    
    // Always update headers to ensure 'PO Tháng' is present
    orderSheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    orderSheet.getRange("A1:L1").setFontWeight("bold").setBackground("#d0e0e3");
    orderSheet.setFrozenRows(1);
    
    const timestamp = new Date();
    
    const orderDataRange = orderSheet.getDataRange().getValues();
    let orderRowIndex = -1;
    for (let i = 1; i < orderDataRange.length; i++) {
      if (String(orderDataRange[i][1]).trim() === String(payload.orderNo).trim()) {
        orderRowIndex = i + 1;
        break;
      }
    }
    
    const orderRowValues = [
      timestamp,
      payload.orderNo,
      payload.orderDate,
      payload.creatorName,
      payload.companyName,
      payload.partnerName,
      payload.partnerAddress,
      payload.vatRate,
      payload.subtotal,
      payload.vatAmount,
      payload.total,
      payload.poMonth || ""
    ];
    
    if (orderRowIndex !== -1) {
      // Ghi đè dòng cũ
      orderSheet.getRange(orderRowIndex, 1, 1, orderRowValues.length).setValues([orderRowValues]);
    } else {
      // Thêm mới
      orderSheet.appendRow(orderRowValues);
    }
    
    // 2. Lưu thông tin chi tiết từng sản phẩm vào tab data_order_details
    let detailSheet = ss.getSheetByName("data_order_details");
    const FIXED_HEADERS = ["Mã đơn hàng", "Tên SP", "Art Code", "Màu", "Tổng SL", "Đơn giá", "Thành tiền (trước VAT)", "Thông tin NPL", "T.Gian Giao", "Ghi Chú"];

    if (!detailSheet) {
      detailSheet = ss.insertSheet("data_order_details");
      detailSheet.getRange(1, 1, 1, FIXED_HEADERS.length).setValues([FIXED_HEADERS]);
      detailSheet.getRange(1, 1, 1, FIXED_HEADERS.length).setFontWeight("bold").setBackground("#fff2cc");
      detailSheet.setFrozenRows(1);
    }
    
    // Đọc header hiện tại để hỗ trợ cột size động
    let lastCol = detailSheet.getLastColumn();
    let currentHeaders = [];
    let headerChanged = false;

    if (lastCol === 0) {
        // Sheet mới tinh hoặc đã bị xóa trắng
        currentHeaders = [...FIXED_HEADERS];
        headerChanged = true;
    } else {
        lastCol = Math.max(lastCol, FIXED_HEADERS.length);
        currentHeaders = detailSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        
        // Cứu vãn trường hợp người dùng xóa mất dòng header đầu tiên
        if (currentHeaders[0] === "") {
            for (let i = 0; i < FIXED_HEADERS.length; i++) {
                currentHeaders[i] = FIXED_HEADERS[i];
            }
            headerChanged = true;
        }
        
        // Loại bỏ các cột trống ở cuối (nếu có)
        while(currentHeaders.length > FIXED_HEADERS.length && currentHeaders[currentHeaders.length - 1] === "") {
            currentHeaders.pop();
        }
    }
    
    const items = payload.items || [];
    const rowsToAppend = [];
    
    // Nếu là edit, xóa toàn bộ các dòng chi tiết cũ của PO này
    const detailsDataRange = detailSheet.getDataRange().getValues();
    for (let i = detailsDataRange.length - 1; i >= 1; i--) {
      if (String(detailsDataRange[i][0]).trim() === String(payload.orderNo).trim()) {
        detailSheet.deleteRow(i + 1);
      }
    }
    
    // Hàm chuẩn hóa size - gộp size chữ và size số vào cùng cột
    // Kết quả: S, M/29, L/30, XL/31, XXL/32, 34
    function normalizeSize(size) {
      let s = String(size).toUpperCase().trim();
      s = s.replace(/\.0$/, '');
      if (s === 'S') return 'S';
      if (s === 'M' || s === '29') return 'M/29';
      if (s === 'L' || s === '30') return 'L/30';
      if (s === 'XL' || s === '31') return 'XL/31';
      if (s === 'XXL' || s === '2XL' || s === '32') return 'XXL/32';
      if (s === '34') return '34';
      if (s === 'FREESIZE') return 'FREE';
      return s;
    }

    // Thứ tự cột size cố định
    const SIZE_ORDER = ['S', 'M/29', 'L/30', 'XL/31', 'XXL/32', '34', 'FREE'];

    // Quét qua tất cả các size để thêm cột mới vào header nếu cần
    const neededSizes = new Set();
    items.forEach(it => {
       if (it.sizeData) {
           Object.keys(it.sizeData).forEach(sizeName => {
               neededSizes.add(normalizeSize(sizeName));
           });
       }
    });

    // Thêm các size mới theo đúng thứ tự cố định
    SIZE_ORDER.forEach(sizeKey => {
        const colName = "Size " + sizeKey;
        if (neededSizes.has(sizeKey) && !currentHeaders.includes(colName)) {
            currentHeaders.push(colName);
            headerChanged = true;
        }
    });
    // Size ngoại lệ (không nằm trong bộ chuẩn) thêm vào cuối
    neededSizes.forEach(sizeKey => {
        const colName = "Size " + sizeKey;
        if (!currentHeaders.includes(colName)) {
            currentHeaders.push(colName);
            headerChanged = true;
        }
    });
    
    if (headerChanged) {
        detailSheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
        detailSheet.getRange(1, 1, 1, currentHeaders.length).setFontWeight("bold").setBackground("#fff2cc");
    }
    
    items.forEach(it => {
      const lineSubtotal = it.totalQty * it.unitPrice;
      
      // Định dạng ngày giao hàng nếu có
      let deliveryDateStr = it.deliveryDate;
      if (it.deliveryDate) {
         try { deliveryDateStr = new Date(it.deliveryDate).toLocaleDateString('vi-VN'); } catch(e) {}
      }

      // Khởi tạo dòng dữ liệu tương ứng với số lượng cột hiện tại
      const rowData = new Array(currentHeaders.length).fill("");
      
      // Điền thông tin cố định
      rowData[0] = payload.orderNo;
      rowData[1] = it.productName;
      rowData[2] = it.artCode;
      rowData[3] = it.color;
      rowData[4] = it.totalQty;
      rowData[5] = it.unitPrice;
      rowData[6] = lineSubtotal;
      rowData[7] = it.nplInfo;
      rowData[8] = deliveryDateStr;
      rowData[9] = it.note;
      
      // Điền thông tin size vào đúng cột tương ứng
      if (it.sizeData) {
          Object.keys(it.sizeData).forEach(sizeName => {
              const normSize = normalizeSize(sizeName);
              const colName = "Size " + normSize;
              const idx = currentHeaders.indexOf(colName);
              if (idx !== -1) {
                  rowData[idx] = it.sizeData[sizeName];
              }
          });
      }
      
      rowsToAppend.push(rowData);
    });
    
    if (rowsToAppend.length > 0) {
      detailSheet.getRange(detailSheet.getLastRow() + 1, 1, rowsToAppend.length, currentHeaders.length).setValues(rowsToAppend);
    }
    
    return {
      success: true,
      message: "Lưu đơn hàng thành công!"
    };
    
  } catch (error) {
    return {
      success: false,
      message: error.message || String(error)
    };
  }
}

function getOrderHistory() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const orderSheet = ss.getSheetByName("data_order");
    if (!orderSheet) return [];
    
    const data = orderSheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const results = [];
    for (let i = data.length - 1; i > 0; i--) {
      results.push({
        timestamp: data[i][0],
        orderNo: data[i][1],
        orderDate: data[i][2],
        creatorName: data[i][3],
        companyName: data[i][4],
        partnerName: data[i][5],
        total: data[i][10],
        poMonth: data[i][11] || ""
      });
    }
    
    return results;
  } catch (err) {
    return [];
  }
}

function getOrderDetails(orderNo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const detailSheet = ss.getSheetByName("data_order_details");
    if (!detailSheet) return [];
    
    const data = detailSheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const headers = data[0];
    const results = [];
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(orderNo)) {
        let rowObj = {};
        for (let j = 0; j < headers.length; j++) {
           if (headers[j]) {
             rowObj[headers[j]] = data[i][j];
           }
        }
        results.push(rowObj);
      }
    }
    
    return results;
  } catch (err) {
    return [];
  }
}


function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    if (payload.action === 'login') {
      const result = checkLogin(payload.username, payload.password);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'saveOrder' || payload.action === 'updateOrder') {
      const result = saveOrderData(payload.data);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'saveReceiving') {
      const result = saveReceivingData(payload.data);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({success: false, message: "Invalid action"})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveReceivingData(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let receivingSheet = ss.getSheetByName("data_receiving");
    const FIXED_HEADERS = ["Thời gian lưu", "Mã đơn hàng", "PO Tháng", "Người nhập", "Ngày nhập", "Đợt nhập", "Tên SP", "Art Code", "Màu", "Tổng SL nhận", "Ghi chú"];
    
    if (!receivingSheet) {
      receivingSheet = ss.insertSheet("data_receiving");
      receivingSheet.getRange(1, 1, 1, FIXED_HEADERS.length).setValues([FIXED_HEADERS]);
      receivingSheet.getRange(1, 1, 1, FIXED_HEADERS.length).setFontWeight("bold").setBackground("#d9ead3");
      receivingSheet.setFrozenRows(1);
    }
    
    let lastCol = receivingSheet.getLastColumn();
    let currentHeaders = [];
    let headerChanged = false;

    if (lastCol === 0) {
        currentHeaders = [...FIXED_HEADERS];
        headerChanged = true;
    } else {
        lastCol = Math.max(lastCol, FIXED_HEADERS.length);
        currentHeaders = receivingSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        if (currentHeaders[0] === "") {
            for (let i = 0; i < FIXED_HEADERS.length; i++) {
                currentHeaders[i] = FIXED_HEADERS[i];
            }
            headerChanged = true;
        }
        while(currentHeaders.length > FIXED_HEADERS.length && currentHeaders[currentHeaders.length - 1] === "") {
            currentHeaders.pop();
        }
    }
    
    const timestamp = new Date();
    const rowsToAppend = [];
    const items = payload.items || [];
    
    function normalizeSize(size) {
      let s = String(size).toUpperCase().trim();
      s = s.replace(/\.0$/, '');
      if (s === 'S') return 'S';
      if (s === 'M' || s === '29') return 'M/29';
      if (s === 'L' || s === '30') return 'L/30';
      if (s === 'XL' || s === '31') return 'XL/31';
      if (s === 'XXL' || s === '2XL' || s === '32') return 'XXL/32';
      if (s === '34') return '34';
      if (s === 'FREESIZE') return 'FREE';
      return s;
    }

    const SIZE_ORDER = ['S', 'M/29', 'L/30', 'XL/31', 'XXL/32', '34', 'FREE'];
    const neededSizes = new Set();
    
    items.forEach(it => {
       if (it.sizeData) {
           Object.keys(it.sizeData).forEach(sizeName => {
               neededSizes.add(normalizeSize(sizeName));
           });
       }
    });

    SIZE_ORDER.forEach(sizeKey => {
        const colName = "Size " + sizeKey;
        if (neededSizes.has(sizeKey) && !currentHeaders.includes(colName)) {
            currentHeaders.push(colName);
            headerChanged = true;
        }
    });

    Array.from(neededSizes).forEach(sizeKey => {
        if (!SIZE_ORDER.includes(sizeKey)) {
            const colName = "Size " + sizeKey;
            if (!currentHeaders.includes(colName)) {
                currentHeaders.push(colName);
                headerChanged = true;
            }
        }
    });

    if (headerChanged) {
        receivingSheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
        receivingSheet.getRange(1, 1, 1, currentHeaders.length).setFontWeight("bold").setBackground("#d9ead3");
    }

    items.forEach(it => {
      const rowData = new Array(currentHeaders.length).fill("");
      let totalQty = 0;
      if (it.sizeData) {
         Object.values(it.sizeData).forEach(qty => {
            totalQty += Number(qty) || 0;
         });
      }

      rowData[currentHeaders.indexOf("Thời gian lưu")] = timestamp;
      rowData[currentHeaders.indexOf("Mã đơn hàng")] = payload.orderNo || "";
      rowData[currentHeaders.indexOf("PO Tháng")] = payload.poMonth || "";
      rowData[currentHeaders.indexOf("Người nhập")] = payload.receiverName || "";
      rowData[currentHeaders.indexOf("Ngày nhập")] = payload.receivingDate || "";
      rowData[currentHeaders.indexOf("Đợt nhập")] = payload.receiveBatch || "";
      rowData[currentHeaders.indexOf("Tên SP")] = it.productName || "";
      rowData[currentHeaders.indexOf("Art Code")] = it.artCode || "";
      rowData[currentHeaders.indexOf("Màu")] = it.color || "";
      rowData[currentHeaders.indexOf("Tổng SL nhận")] = totalQty;
      rowData[currentHeaders.indexOf("Ghi chú")] = it.note || "";

      if (it.sizeData) {
         Object.keys(it.sizeData).forEach(sizeName => {
             const colName = "Size " + normalizeSize(sizeName);
             const colIdx = currentHeaders.indexOf(colName);
             if (colIdx >= 0) {
                 rowData[colIdx] = it.sizeData[sizeName];
             }
         });
      }
      rowsToAppend.push(rowData);
    });
    
    if (rowsToAppend.length > 0) {
      receivingSheet.getRange(receivingSheet.getLastRow() + 1, 1, rowsToAppend.length, currentHeaders.length).setValues(rowsToAppend);
    }
    
    return { success: true, message: "Lưu thông tin nhập hàng thành công!" };
  } catch (error) {
    return { success: false, message: error.message || String(error) };
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'getHistory') {
      const result = getOrderHistory();
      return ContentService.createTextOutput(JSON.stringify({success: true, data: result})).setMimeType(ContentService.MimeType.JSON);
    }
    if (e && e.parameter && e.parameter.action === 'getOrderDetails') {
      const result = getOrderDetails(e.parameter.orderNo);
      return ContentService.createTextOutput(JSON.stringify({success: true, data: result})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("Backend is running").setMimeType(ContentService.MimeType.TEXT);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
