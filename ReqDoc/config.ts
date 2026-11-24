import * as ECB from 'ECB';
/**************************************************************************************************
 * DataIdentifier
 * Use to identify different types of calibration data
 ****************************************************************************************************/
export enum DataIdentifier {
  Voltage = 0x1000, /*Voltage calibration data identifier*/
  Resistance = 0x1001, /*Resistance calibration data identifier*/
  Battery = 0x1004, /*Battery calibration data identifier*/
  Current = 0x1005, /*Current calibration data identifier*/
  /*****************************************************************************************************/
  SoftwareVersion = 0x0694, /*Software version calibration data identifier*/
  SoftwareDate = 0x0695, /*Software date calibration data identifier*/
  BootloaderDate = 0x0696, /*Bootloader date calibration data identifier*/
  BootloaderVersion = 0x0697, /*Bootloader version calibration data identifier*/
  /*****************************************************************************************************/
  PartSerialNumber = 0x0724, /*Part serial number calibration data identifier*/
  SoftwarePartNumber = 0xF188, /*Software part number calibration data identifier*/
  HardwarePartNumber = 0xF191, /*Hardware part number calibration data identifier*/
  VendorCode = 0xF18A, /*Vendor code calibration data identifier*/
  DateOfManufacture = 0xF18B, /*Date of manufacture calibration data identifier*/
}
enum PCItype {
  SF = 0x00, /*Single frame*/
  FF = 0x01, /*First frame*/
  CF = 0x02, /*Consecutive frame*/
  FC = 0x03, /*Flow control frame*/
}
enum ServiceId {
  Read_0X22 = 0x22, /*Read*/
  Write_0x2E = 0x2E, /*Write*/
}

/**************************************************************************************************
 * Variable  Definition Start
 ****************************************************************************************************/
export const UDS_NAD: number = 0x47;
export const DEBUG: boolean = false;
export const Calibration_DataUseDefault: boolean = true;
/*************Voltage Calibration ************* */
export const VoltageFactor: number = 1.0;
export const VoltageFactorMax: number = 1.1;
export const VoltageFactorMin: number = 0.9;
export const VoltageOffset: number = 0;
export const VoltageOffsetMax: number = 0.9;
export const VoltageGain: number = 1000;

/*************Current Calibration ************* */
export const CurrentFactor: number = 1.0;
export const CurrentFactorMax: number = 1.1;
export const CurrentFactorMin: number = 0.9;
export const CurrentOffset: number = 0;
export const CurrentOffsetMax: number = 0.1;

export const CurrentGain: number = 1000;
/*************Resistance Calibration ************* */
export const ResistanceInitial: number = 150;
export const ResistanceInitialMax: number = 160;
export const ResistanceInitialMin: number = 140;
export const ResistancePrimary: number = 0.0001034;
export const ResistancePrimaryMax: number = 0.00011;
export const ResistancePrimaryMin: number = 0.00009;
export const ResistanceQuadratic: number = -0.000000453;
export const ResistanceQuadraticMax: number = -0.0000004;
export const ResistanceQuadraticMin: number = -0.000000553;
export const ResistanceOffset: number = 0.997664843;
export const ResistanceOffsetMax: number = 0.999;
export const ResistanceOffsetMin: number = 0.995;
export const ResistanceGain: number = 1000000;
/*************Battery Calibration ************* */
export const BatteryNumber = 1;

/**************************************************************************************************
 * Expected Value Definition Start
 * All expected values are stored as raw bytes / raw numbers, never as ASCII strings
 ****************************************************************************************************/
/** Expected software version, raw bytes of "IBS_1.0.09" */
export const Expected_SoftwareVersion: Uint8Array = asciiToBytes('IBS_1.0.09');
/** Expected bootloader version(s), raw bytes of "1.0.04" / "1.0.05" */
export const Expected_BootloaderVersion: Uint8Array[] = [
  asciiToBytes('1.0.04'),
  asciiToBytes('1.0.05'),
];
/** Expected software part number, raw bytes of "IBS_P03140" */
export const Expected_SoftwarePartNumber: Uint8Array = asciiToBytes('IBS_P03140');
/** Expected hardware part number, raw bytes of "IBS_HW_1.4" */
export const Expected_HardwarePartNumber: Uint8Array = asciiToBytes('IBS_HW_1.4');
/** Expected vendor code, raw bytes of "JK6275" */
export const Expected_VendorCode: Uint8Array = asciiToBytes('JK6275');
/** Expected software compile date as raw BCD bytes: 2026-11-10 14:39 */
export const Expected_SoftwareDateBcd: Uint8Array = new Uint8Array([0x20, 0x26, 0x11, 0x10, 0x14, 0x39]);
/** Expected bootloader compile dates as raw BCD bytes: 2026-03-04 15:00 / 2026-05-08 09:50 */
export const Expected_BootloaderDateBcd: Uint8Array[] = [
  new Uint8Array([0x20, 0x26, 0x03, 0x04, 0x15, 0x00]),
  new Uint8Array([0x20, 0x26, 0x05, 0x08, 0x09, 0x50]),
];
/**************************************************************************************************
 * Expected Value Definition End
 ****************************************************************************************************/

/**************************************************************************************************
 * ENUM  Definition Start
 ****************************************************************************************************/
/**
 * Floating-point sequence enumeration
 *  (big-endian/little-endian)
 */
export enum Endianness {
  LittleEndian = 'little', /*Little-endian (with the less significant byte first)*/
  BigEndian = 'big',       /*Big-endian (with the most significant byte first)*/
}

/* Frame parse result variables*/
let frameResponseId: number = 0;        /*Frame response ID*/
let frameDataIdentifier: number = 0;    /*DataIdentifier*/
let frameData: Uint8Array = new Uint8Array(0);  /*Frame data part*/

/* Frame receive status variables*/
let Current_ServiceId : number = 0;
let isReceivingMultiFrame: boolean = false;    /*Whether it is receiving multi-frame data*/
let expectedFrameLength: number = 0;          /*Expected total length of frame data*/
let receivedData: Uint8Array = new Uint8Array(0); /*Received frame data*/

/* Measured values decoded from the 0x34 frame*/
let actualU_BATT : number = 0;
let actualI_BATT : number = 0;
let actualT_BATT : number = 0;
/**************************************************************************************************
 * Variable  Definition End
 ****************************************************************************************************/
/**************************************************************************************************
 * Function  Definition Start
 ****************************************************************************************************/
/**
 * Helper: Convert a byte array to a hexadecimal string (useful for debugging)
 * @param byteArray Uint8Array byte array
 * @returns Hexadecimal string (e.g. "41 48 00 00")
 */
export function bytesToHex(byteArray: Uint8Array): string {
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
}
/**
 * Helper: Convert an ASCII text to its raw byte sequence
 * @param asciiText ASCII text
 * @returns Raw bytes of the ASCII text
 */
function asciiToBytes(asciiText: string): Uint8Array {
  const bytes = new Uint8Array(asciiText.length);
  for (let i = 0; i < asciiText.length; i++) {
    bytes[i] = asciiText.charCodeAt(i);
  }
  return bytes;
}
/**
 * Helper: Compare the received payload with an expected raw byte sequence
 * @param data Received payload
 * @param expected Expected raw bytes
 * @returns true when the payload starts with the expected bytes
 */
export function isPayloadMatch(data: Uint8Array, expected: Uint8Array): boolean {
  if (data.length < expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (data[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}
/**
 * Helper: Compare the received payload with any of the expected raw byte sequences
 * @param data Received payload
 * @param expectedList Expected raw byte sequences
 * @returns true when the payload matches one of them
 */
export function isPayloadMatchAny(data: Uint8Array, expectedList: Uint8Array[]): boolean {
  for (const expected of expectedList) {
    if (isPayloadMatch(data, expected)) {
      return true;
    }
  }
  return false;
}
/**
 * Helper: Format 6 BCD bytes (year/month/day/hour/minute) to a readable date string
 * @param data Raw BCD bytes
 * @returns Date string like 2026-03-04 15:00
 */
function formatBcdDate(data: Uint8Array): string {
  const bcdToDec = (value: number) => ((value >> 4) & 0x0f) * 10 + (value & 0x0f);
  const year = bcdToDec(data[0]) * 100 + bcdToDec(data[1]);
  const month = bcdToDec(data[2]);
  const day = bcdToDec(data[3]);
  const hour = bcdToDec(data[4]);
  const minute = bcdToDec(data[5]);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
/**************************************************************************************************
 * 0x34 Frame
 ****************************************************************************************************/
/**
 * Parse 0x34 frame data (MSB little endian)
 * @param data - The frame data as a Uint8Array
 */
export function parseFrame34(
  data: Uint8Array,
): void {
  let uBatt = 0;
  let iBatt = 0;
  let iRange = 0;
  let temp = 0;
  /*check data length*/
  if (data.length !== 8) {
    console.error("Invalid data length for Frame 0x34. Expected 8 bytes.");
    return;
  }
  if (DEBUG) {
    console.log('0x34 received:', bytesToHex(data));
    console.log('Raw data bytes:');
    for (let i = 0; i < data.length; i++) {
      console.log(`Byte ${i}: 0x${data[i].toString(16).padStart(2, '0').toUpperCase()} (${data[i]})`);
    }
  }
  /*U_BATT: bits 0-13 (14 bits)*/
  uBatt = ((data[1] & 0x3F) << 8) | data[0];
  /* I_RANGE: bits 14-15 (2 bits)*/
  iRange = ((data[1] & 0xC0) >> 6);
  /* I_BATT: bits 16-31 (16 bits)*/
  iBatt = ((data[3] & 0xFF) << 8) | data[2];
  /* Calculate actual U_BATT*/
  actualU_BATT = uBatt * 0.0009765625 + 3
  /* Calculate actual I_BATT*/
  switch (iRange) {
    case 0:
      if (iBatt >= 31744 && iBatt <= 33792) {
        actualI_BATT = iBatt * 0.0009765625 - 32;
      }
      break;
    case 1:
      if (iBatt >= 7168 && iBatt <= 58368) {
        actualI_BATT = iBatt * 0.0078125 - 256;
      }
      break;
    case 2:
      if (iBatt >= 8768 && iBatt <= 56768) {
        actualI_BATT = iBatt * 0.0625 - 2048;
      }
      break;
    case 3:

      console.error('I_BATT actual current (Range 3): Reserved/Invalid');

      break;
    default:
      console.error('I_BATT actual current: Unknown range');
      break;
  }
  /*Caculate temperature*/

  //ECB.setVar("Parse_Measured_Data.actualU_BATT", actualU_BATT.toString());
  //ECB.setVar("Parse_Measured_Data.actualI_BATT", actualI_BATT.toString());
  if (DEBUG) {
    console.log('\nSignal values:');
    console.log(`U_BATT: ${actualU_BATT} V (0x${uBatt})`);
    console.log(`I_RANGE: ${iRange} (0x${iRange.toString(16).toUpperCase()})`);
    console.log(`I_BATT:actual current: ${actualI_BATT} A (0x${iBatt})`);
  }
}
/**************************************************************************************************
 * 0x3D Frame
 ****************************************************************************************************/
/**
 * Entry of the 0x3D diagnostic response frame
 * @param data 0x3D frame data
 */
export function handleLin3DFrame(data: Uint8Array): void {
  if (DEBUG) {
    console.log('0x3D received:', bytesToHex(data));
  }

  /* Check the actual ServiceID in the frame and decide how to handle it*/
  if (data.length > 2) {
    const pciFirstByte = data[1];
    const pciType = pciFirstByte >> 4;

    if (pciType === PCItype.SF && data.length > 2) {
      Current_ServiceId = data[2] - 0X40;
    } else if (pciType === PCItype.FF && data.length > 3) {
      Current_ServiceId = data[3] - 0X40;
    }

    /* Call the corresponding processing function based on the actual ServiceID*/
    if (Current_ServiceId === ServiceId.Read_0X22 || Current_ServiceId === ServiceId.Write_0x2E) {
      parseLin3DFrame(data, Current_ServiceId);
    }
  }
}
/**
 * analyze 0x3D frame data
 * @param data 0x3D frame data
 * @param ServiceID Service ID
 */
function parseLin3DFrame(data: Uint8Array, ServiceID: ServiceId): void {
  /* NAD in data[0]*/
  if (data[0] !== UDS_NAD) {
    if (DEBUG) {
      console.error('NAD error');
    }
    return;
  }

  /* Parse PCI*/
  const pciFirstByte = data[1];
  const pciType = pciFirstByte >> 4;

  /* Handle different frames according to the PCI type*/
  if (pciType === PCItype.SF) {
    if ((data[2]) !== ServiceID + 0x40) {
      console.log(`ServiceID error:expect 0x${ServiceID.toString(16)},actual 0x${(data[2]).toString(16)}`);
      return;
    }
    handleSingleFrame(data);
  } else if (pciType === PCItype.FF) {
    if ((data[3]) !== ServiceID + 0x40) {
      console.log(`ServiceID error:expect 0x${ServiceID.toString(16)},actual 0x${(data[3]).toString(16)}`);
      return;
    }
    handleFirstFrame(data);
  } else if (pciType === PCItype.CF) {
    handleConsecutiveFrame(data);
  } else {
    console.log(`unknown PCI type: 0x${pciFirstByte.toString(16)}`);
  }
}

/**
 * handle Single Frame
 * @param data Frame data
 */
function handleSingleFrame(data: Uint8Array): void {
  const pciFirstByte = data[1];
  const dataLength = pciFirstByte & 0x0F; /* PCI first byte low 4 bits represent data length*/
  /* reset receive status*/
  isReceivingMultiFrame = false;
  expectedFrameLength = 0;
  receivedData = new Uint8Array(0);

  /* extract valid data part (skip NAD and PCI)*/
  const frameDataPart = data.subarray(2);

  /* check if data length match*/
  if (frameDataPart.length >= dataLength) {
    /* parse frame response ID (first byte)*/
    frameResponseId = frameDataPart[0] - 0x40;
    /* parse DataIdentifier (next 2 bytes)*/
    frameDataIdentifier = (frameDataPart[1] << 8) | frameDataPart[2];
    /* save remaining data (from 4th byte to dataLength)*/
    frameData = frameDataPart.subarray(3, dataLength);
    console.log(`Receive Single Frame, Total Length=${dataLength} Bytes, 
      Frame Response ID: 0x${frameResponseId.toString(16)}, 
      DataIdentifier: 0x${frameDataIdentifier.toString(16)},
      Single Frame Data: ${bytesToHex(frameData)}`);
    /* process the frame data*/
    processParsedData(frameResponseId + 0x40, frameDataIdentifier, frameData);
  } else {
    console.log(`Single Frame Data Length Insufficient: Expected=${dataLength},
       Actual=${frameDataPart.length}`);

  }
}

/**
 * handle First Frame
 * @param data Frame data
 */
function handleFirstFrame(data: Uint8Array): void {
  /* ensure data length sufficient (at least 4 bytes: NAD + PCI(2 bytes) + data)*/
  if (data.length < 4) {
    console.log('First Frame Data Too Short');
    return;
  }

  const pciFirstByte = data[1];
  const pciSecondByte = data[2];
  /* data length is composed by PCI first byte low 4 bits and second byte*/
  const dataLength = ((pciFirstByte & 0x0F) << 8) | pciSecondByte;
  if (DEBUG) {
    console.log(`Receive First Frame, Total Length=${dataLength} Bytes`);
  }
  /* reset receive status*/
  isReceivingMultiFrame = true;
  expectedFrameLength = dataLength;
  receivedData = new Uint8Array(0);

  /* extract valid data part (skip NAD and PCI)*/
  const frameDataPart = data.subarray(3);

  /* add first frame data to received data*/
  receivedData = new Uint8Array(frameDataPart);
  if (DEBUG) {
    console.log(`First Frame Data Length: ${receivedData.length} Bytes`);
  }

  /* check if all data has been received (single frame case)*/
  if (receivedData.length >= expectedFrameLength) {
    processCompleteData();
  }
}

/**
 * handle Consecutive Frame
 * @param data Frame data
 */
function handleConsecutiveFrame(data: Uint8Array): void {
  if (!isReceivingMultiFrame) {
    console.log(`Receive Consecutive Frame but not in multi-frame receive state`);
    return;
  }

  const pciFirstByte = data[1];
  const frameNumber = pciFirstByte & 0x0F; /* Frame Number (0-15 loop)*/
  if (DEBUG) {
    console.log(`Receive Consecutive Frame, Frame Number=${frameNumber}`);
  }

  /* Extract valid data part (skip NAD and PCI)*/
  const frameDataPart = data.subarray(2);

  /* Pooled  FF data and CF data*/
  const newReceivedData = new Uint8Array(receivedData.length + frameDataPart.length);
  newReceivedData.set(receivedData);
  newReceivedData.set(frameDataPart, receivedData.length);
  receivedData = newReceivedData;
  if (DEBUG) {
    console.log(`Cumulative Received Data Length: ${receivedData.length} Bytes`);
  }

  /* Check if all data has been received*/
  if (receivedData.length >= expectedFrameLength) {
    processCompleteData();
  }
}
/**
 * handle Complete Data
 */
function processCompleteData() {
  if (DEBUG) {
    console.log('Complete Data Received!');
    console.log(`Total Data Length: ${receivedData.length} Bytes`);
    console.log(`Expected Data Length: ${expectedFrameLength} Bytes`);
  }

  /* If actual received data length exceeds expected, trim it*/
  let actualReceivedData = receivedData;
  if (receivedData.length > expectedFrameLength) {
    actualReceivedData = receivedData.subarray(0, expectedFrameLength);
    if (DEBUG) {
      console.log(`Trimmed Actual Received Data Length: ${actualReceivedData.length} Bytes`);
    }
  }

  /* Parse Frame Response ID (first byte)*/
  if (actualReceivedData.length > 0) {
    frameResponseId = actualReceivedData[0];
    if (DEBUG) {
      console.log(`Frame Response ID: 0x${frameResponseId.toString(16)}`);
    }
  }

  /* Parse DataIdentifier (next 2 bytes)*/
  if (actualReceivedData.length > 2) {
    frameDataIdentifier = (actualReceivedData[1] << 8) | actualReceivedData[2];
    if (DEBUG) {
      console.log(`DataIdentifier: 0x${frameDataIdentifier.toString(16)}`);
    }
  }

  /* Extract Actual Data (skip Response ID and DataIdentifier)*/
  if (actualReceivedData.length > 3) {
    frameData = actualReceivedData.subarray(3);
    if (DEBUG) {
      console.log(`Actual Data: ${bytesToHex(frameData)}`);
      console.log(`Actual Data Length: ${frameData.length} Bytes`);
    }
  }

  /* Reset Receive Status*/
  isReceivingMultiFrame = false;
  expectedFrameLength = 0;

  /* Process Parsed Data*/
  processParsedData(frameResponseId, frameDataIdentifier, frameData);

  /* Clear Received Data*/
  receivedData = new Uint8Array(0);
}
/**
 * Proceed with subsequent processing based on the analysis results
 */
function processParsedData(responseId: number, dataId: number, data: Uint8Array) {

  if ((responseId - 0x40) !== ServiceId.Read_0X22) {
    return;
  }
  switch (dataId) {
    case DataIdentifier.Voltage:
      parseAndCompareVoltageData(data);
      break;
    case DataIdentifier.Current:
      parseAndCompareCurrentData(data);
      break;
    case DataIdentifier.Battery:
      parseAndCompareBatteryData(data);
      break;
    case DataIdentifier.Resistance:
      parseAndCompareResistanceData(data);
      break;
    case DataIdentifier.SoftwareVersion:
      parseAndCompareSoftwareVersionData(data);
      break;
    case DataIdentifier.SoftwareDate:
      parseAndCompareSoftwareDateData(data);
      break;
    case DataIdentifier.BootloaderDate:
      parseAndCompareBootloaderDateData(data);
      break;
    case DataIdentifier.BootloaderVersion:
      parseAndCompareBootloaderVersionData(data);
      break;
    case DataIdentifier.PartSerialNumber:
      parseAndComparePartSerialNumberData(data);
      break;
    case DataIdentifier.HardwarePartNumber:
      parseAndCompareHardwarePartNumberData(data);
      break;
    case DataIdentifier.SoftwarePartNumber:
      parseAndCompareSoftwarePartNumberData(data);
      break;
    case DataIdentifier.VendorCode:
      parseAndCompareVendorCodeData(data);
      break;
    case DataIdentifier.DateOfManufacture:
      parseAndCompareDateOfManufactureData(data);
      break;

    default:
      console.log(`接收到未知类型数据, DataIdentifier: 0x${dataId.toString(16)}`);
  }
}

/**
 * Parse and compare voltage calibration data
 * @param data Voltage calibration data
 */
function parseAndCompareVoltageData(data: Uint8Array) {
  /* Voltage calibration data contains Factor(4 bytes) + Offset(4 bytes) */
  if (data.length < 8)
  /* Voltage calibration data contains Factor(4 bytes) + Offset(4 bytes) + CRC(2 bytes)*/ {
    console.log('Voltage calibration data length is insufficient');
    return;
  }

  /* Extract Factor (first 4 bytes)*/
  const factorBytes = data.subarray(0, 4);
  const factorView = new DataView(factorBytes.buffer, factorBytes.byteOffset, factorBytes.byteLength);
  const receivedFactor = factorView.getFloat32(0, true); /* Factor (Little-endian)*/

  /* Extract Offset (next 4 bytes)*/
  const offsetBytes = data.subarray(4, 8);
  const offsetView = new DataView(offsetBytes.buffer, offsetBytes.byteOffset, offsetBytes.byteLength);
  const receivedOffset = offsetView.getFloat32(0, true); /* Offset (Little-endian)*/

  /* Extract CRC (last 2 bytes)*/
  const crcBytes = data.subarray(8, 10);

  /* Calculate actual values (divide by gain)*/
  const actualFactor = receivedFactor / VoltageGain;
  const actualOffset = receivedOffset / VoltageGain;

  if (actualFactor < VoltageFactorMin || actualFactor > VoltageFactorMax) {
    console.error('电压增益数据异常:',
      actualFactor +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else if (actualOffset > VoltageOffsetMax) {
    console.error('电压偏移数据异常:',
      actualOffset +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('电压标定数据正常');
  }
  //ECB.setVar('Calibration_Out.Voltage_Factor', actualFactor);
  //ECB.setVar('Calibration_Out.Voltage_Offset', actualOffset);

}

/**
 * Parse and compare current calibration data
 * @param data Current calibration data
 */
function parseAndCompareCurrentData(data: Uint8Array) {
  /* Current calibration data contains Factor(4 bytes) + Offset(4 bytes) */
  if (data.length < 8)
  /* Current calibration data contains Factor(4 bytes) + Offset(4 bytes) + CRC(2 bytes)*/ {
    console.log('Current calibration data length is insufficient');
    return;
  }

  /* Extract Factor (first 4 bytes)*/
  const factorBytes = data.subarray(0, 4);
  const factorView = new DataView(factorBytes.buffer, factorBytes.byteOffset, factorBytes.byteLength);
  const receivedFactor = factorView.getFloat32(0, true); /* Factor (Little-endian)*/

  /* Extract Offset (next 4 bytes)*/
  const offsetBytes = data.subarray(4, 8);
  const offsetView = new DataView(offsetBytes.buffer, offsetBytes.byteOffset, offsetBytes.byteLength);
  const receivedOffset = offsetView.getFloat32(0, true); /* Offset (Little-endian)*/

  /* Calculate actual values (divide by gain)*/
  const actualFactor = receivedFactor / CurrentGain;
  const actualOffset = receivedOffset / CurrentGain;

  if (actualFactor < CurrentFactorMin || actualFactor > CurrentFactorMax) {
    console.error('电流增益数据异常:',
      actualFactor +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else if (actualOffset > CurrentOffsetMax) {
    console.error('电流偏移数据异常:',
      actualOffset +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('电流标定数据正常');
  }

  //ECB.setVar('Calibration_Out.Current_Factor', actualFactor);
  //ECB.setVar('Calibration_Out.Current_Offset', actualOffset);
}
/**
 * Parse and compare battery calibration data
 * @param data Battery calibration data
 */
function parseAndCompareBatteryData(data: Uint8Array) {
  /* Battery calibration data contains Number(1 byte) + CRC(2 bytes)*/
  if (data.length < 1) {
    console.log('Battery calibration data length is insufficient');
    return;
  }

  /* Extract Number (first 1 byte)*/
  const numberBytes = data.subarray(0, 1);
  const numberView = new DataView(numberBytes.buffer, numberBytes.byteOffset, numberBytes.byteLength);
  const actualNumber = numberView.getInt8(0); /* Number (Little-endian)*/

  const actualFactor = actualNumber;

  if (DEBUG) {
    console.log(`电池标定数据解析结果:`);
    console.log(`  Factor: ${actualFactor} (接收到: ${actualNumber})`);
  }
  if (actualNumber !== BatteryNumber) {
    console.error('电池编号数据异常:',
      actualNumber +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');

  }
  else {
    console.log('电池编号数据正常');
  }
  //ECB.setVar('Calibration_Out.Out_Battery', actualNumber);
}
/**
 * Parse and compare resistance calibration data
 * @param data Resistance calibration data
 */
function parseAndCompareResistanceData(data: Uint8Array) {
  /* Resistance calibration data contains Initial(4 bytes) + Quadratic(4 bytes) + Primary(4 bytes) + Offset(4 bytes)*/
  if (data.length < 16)
  /* Resistance calibration data contains Initial(4 bytes) + Quadratic(4 bytes) + Primary(4 bytes) + Offset(4 bytes) + CRC(2 bytes)*/ {
    console.log('Resistance calibration data length is insufficient');
    return;
  }

  /* Extract Initial (first 4 bytes)*/
  const initialBytes = data.subarray(0, 4);
  const initialView = new DataView(initialBytes.buffer, initialBytes.byteOffset, initialBytes.byteLength);
  const receivedInitial = initialView.getFloat32(0, true); /* Initial (Little-endian)*/

  /* Extract Quadratic (next 4 bytes)*/
  const quadraticBytes = data.subarray(4, 8);
  const quadraticView = new DataView(quadraticBytes.buffer, quadraticBytes.byteOffset, quadraticBytes.byteLength);
  const receivedQuadratic = quadraticView.getFloat32(0, true); /* Quadratic (Little-endian)*/

  /* Extract Primary (next 4 bytes)*/
  const primaryBytes = data.subarray(8, 12);
  const primaryView = new DataView(primaryBytes.buffer, primaryBytes.byteOffset, primaryBytes.byteLength);
  const receivedPrimary = primaryView.getFloat32(0, true); /* Primary (Little-endian)*/

  /* Extract Offset (next 4 bytes)*/
  const offsetBytes = data.subarray(12, 16);
  const offsetView = new DataView(offsetBytes.buffer, offsetBytes.byteOffset, offsetBytes.byteLength);
  const receivedOffset = offsetView.getFloat32(0, true); /* Offset (Little-endian)*/

  /* Calculate actual values (divide by gain)*/
  const actualInitial = receivedInitial / ResistanceGain;
  const actualQuadratic = receivedQuadratic / ResistanceGain;
  const actualPrimary = receivedPrimary / ResistanceGain;
  const actualOffset = receivedOffset / ResistanceGain;

  if (actualInitial != ResistanceInitial) {
    console.error('电阻初始电阻标定数据异常:',
      actualInitial +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else if ((actualPrimary > ResistancePrimaryMax) || (actualPrimary < ResistancePrimaryMin)) {
    console.error('电阻一次项标定数据异常:',
      actualPrimary +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else if ((actualQuadratic > ResistanceQuadraticMax) || (actualQuadratic < ResistanceQuadraticMin)) {
    console.error('电阻二次项标定数据异常:',
      actualQuadratic +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else if ((actualOffset > ResistanceOffsetMax) || (actualOffset < ResistanceOffsetMin)) {
    console.error('电阻偏移标定数据异常:',
      actualOffset +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('电阻标定数据正常');
  }
  //ECB.setVar('Calibration_Out.Res_InitialResistance', actualInitial);
  //ECB.setVar('Calibration_Out.Res_Quadratic', actualQuadratic);
  //ECB.setVar('Calibration_Out.Res_Primary', actualPrimary);
  //ECB.setVar('Calibration_Out.Res_Offset', actualOffset);

}
function parseAndCompareSoftwareVersionData(data: Uint8Array) {

  if (!isPayloadMatch(data, Expected_SoftwareVersion)) {
    console.error('软件版本异常:',
      Buffer.from(data).toString('ascii') +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('软件版本:', Buffer.from(data).toString('ascii'));
  }
}
function parseAndCompareSoftwareDateData(data: Uint8Array) {
  const compileDate = formatBcdDate(data);
 // ECB.setVar('Software_Data.Date', compileDate);
  if (!isPayloadMatch(data, Expected_SoftwareDateBcd)) {
    console.error('软件日期异常:',
      compileDate +
      `(原始: ${Buffer.from(data).toString('hex')})`);
  }
  else {
    console.log('软件日期:', compileDate);
  }
}
function parseAndCompareBootloaderDateData(data: Uint8Array) {
  const compileDate = formatBcdDate(data);
  if (!isPayloadMatchAny(data, Expected_BootloaderDateBcd)) {
    console.error('Bootloader编译日期异常:',
      compileDate,
      `(原始: ${Buffer.from(data).toString('hex')})`);
  }
  else {
    console.log('Bootloader编译日期:', compileDate);
  }
}
function parseAndCompareBootloaderVersionData(data: Uint8Array) {

  if (!isPayloadMatchAny(data, Expected_BootloaderVersion)) {
    console.error('Bootloader版本异常:',
      Buffer.from(data).toString('ascii') +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('Bootloader版本:', Buffer.from(data).toString('ascii'));
  }
}
function parseAndComparePartSerialNumberData(data: Uint8Array) {
  const firstByteAscii = String.fromCharCode(data[0]);
  const restHex = Buffer.from(data.slice(1)).toString('hex');

  console.log('零件序列号:', firstByteAscii + restHex);
}
function parseAndCompareSoftwarePartNumberData(data: Uint8Array) {
  if (!isPayloadMatch(data, Expected_SoftwarePartNumber)) {
    console.error('软件零件号异常:',
      Buffer.from(data).toString('ascii') +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('软件零件号:', Buffer.from(data).toString('ascii'));
  }
}
function parseAndCompareHardwarePartNumberData(data: Uint8Array) {
  if (!isPayloadMatch(data, Expected_HardwarePartNumber)) {
    console.error('硬件零件号异常:',
      Buffer.from(data).toString('ascii') +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('硬件零件号:', Buffer.from(data).toString('ascii'));
  }
}
function parseAndCompareVendorCodeData(data: Uint8Array) {
  if (!isPayloadMatch(data, Expected_VendorCode)) {
    console.error('供应商代码异常:',
      Buffer.from(data).toString('ascii') +
      ' (原始: ' + Buffer.from(data).toString('hex') + ')');
  }
  else {
    console.log('供应商代码:', Buffer.from(data).toString('ascii'));
  }
}

function parseAndCompareDateOfManufactureData(data: Uint8Array) {
  const bcdToDec = (value: number) => ((value >> 4) & 0x0f) * 10 + (value & 0x0f);
  const year = bcdToDec(data[0]) * 100 + bcdToDec(data[1]);
  const month = bcdToDec(data[2]);
  const day = bcdToDec(data[3]);
  const dateOfManufacture = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  console.log('生产日期:', dateOfManufacture);
}
/**************************************************************************************************
 * Function  Definition End
 ****************************************************************************************************/