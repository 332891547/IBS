# 0x22 calibration reads: independent CAPL Inline bodies

Paste each fenced block into a separate CAPL Inline node in a Test Case that has already powered the IBS and enabled diagnostic communication. Do not include the Markdown fences. The three blocks do not share variables. The timeout values are 2000 ms for request-sent and 5000 ms for response; adjust them to the actual LIN diagnostic timing when integrating.

DID 0x1001 and 0x1005 report the sent UDS request, the received diagnostic object, raw response bytes and decoded values separately. For 0x1001, the 21-byte raw response is split across three consecutive report steps, in byte order. The existing 0x1000 block is unchanged. Decoding follows `ReqDoc/config.ts`: little-endian IEEE-754 Float32; divide voltage/current fields by 1000 and resistance fields by 1000000. CRC is displayed as a little-endian 16-bit value, not validated. The CANoe Basic Diagnostics console does not show requests sent by these CAPL Inline blocks; use the Trace or test report for those transactions.

## DID 0x1000: voltage

```capl

/*==================================================
 * IBS DID 0x1000 电压校准数据读取
 *
 * ECU : IBS
 * SID : 0x22
 * DID : 0x1000
 * Data:
 *   Factor     4 Byte Float
 *   Offset     4 Byte Float
 *   VoltageCRC 2 Byte
 *==================================================*/

long ret;
long sent;
long waited;
long size;
long copied;
long i;

byte respData[64];

dword bits;

float factor;
float offset;

long crcValue;

diagRequest IBS.Voltage_acquisition_calibration_data_Read req;
diagResponse IBS.Voltage_acquisition_calibration_data_Read resp;


/*========== 1. 设置诊断目标 ==========*/

diagSetTarget("IBS");


/*========== 2. 发送诊断请求 ==========*/

ret = diagSendRequest(req);

if (ret < 0)
{
  testStepFail("DID1000_SEND",
               "Diagnostic request send failed: %d", ret);
}
else
{
  /*========== 3. 等待请求发送完成 ==========*/

  sent = testWaitForDiagRequestSent(req, 2000);

  if (sent != 1)
  {
    testStepFail("DID1000_SEND",
                 "Request not sent: %d", sent);
  }
  else
  {
    /*========== 4. 等待诊断响应 ==========*/

    waited = testWaitForDiagResponse(req, 5000);

    if (waited != 1)
    {
      testStepFail("DID1000_WAIT",
                   "Diagnostic response timeout: %d", waited);
    }
    else
    {
      /*========== 5. 获取诊断响应 ==========*/

      ret = diagGetLastResponse(req, resp);

      if (ret < 0)
      {
        testStepFail("DID1000_READ",
                     "Get response failed: %d", ret);
      }
      else
      {
        size = diagGetPrimitiveSize(resp);

        if (size <= 0 || size > elcount(respData))
        {
          testStepFail("DID1000_SIZE",
                       "Invalid response size: %d", size);
        }
        else
        {
          copied = diagGetPrimitiveData(
                     resp,
                     respData,
                     elcount(respData));

          if (copied != size)
          {
            testStepFail("DID1000_READ",
                         "Data copy failed: %d / %d",
                         copied, size);
          }
          else
          {
            /*========== 6. 输出原始响应 ==========*/

            write("========== DID 0x1000 RAW ==========");
            write("Response size: %d", size);

            for (i = 0; i < size; i++)
            {
              write("RAW[%d] = 0x%02X",
                    i, respData[i]);
            }

            /*========== 7. 检查否定响应 ==========*/

            if (diagIsNegativeResponse(resp))
            {
              testStepFail("DID1000_NRC",
                           "Negative diagnostic response");
            }
            else if (size != 13 ||
                     respData[0] != 0x62 ||
                     respData[1] != 0x10 ||
                     respData[2] != 0x00)
            {
              testStepFail("DID1000_FORMAT",
                           "Invalid response format, size=%d",
                           size);
            }
            else
            {
              /*========== 8. 解析 Factor ==========*/

              bits = (dword)respData[3]
                   | ((dword)respData[4] << 8)
                   | ((dword)respData[5] << 16)
                   | ((dword)respData[6] << 24);

              factor = interpretAsFloat(bits) / 1000.0;

              /*========== 9. 解析 Offset ==========*/

              bits = (dword)respData[7]
                   | ((dword)respData[8] << 8)
                   | ((dword)respData[9] << 16)
                   | ((dword)respData[10] << 24);

              offset = interpretAsFloat(bits) / 1000.0;

              /*========== 10. 解析 VoltageCRC ==========*/

              crcValue = (long)respData[11]
                       | ((long)respData[12] << 8);

              /*========== 11. 输出解析结果 ==========*/

              write("========== DID 0x1000 DECODE ==========");

              write("Factor HEX: 0x%08X", 
                    (dword)respData[3]
                    | ((dword)respData[4] << 8)
                    | ((dword)respData[5] << 16)
                    | ((dword)respData[6] << 24));

              write("Factor = %f", factor);
              write("Offset = %f", offset);
              write("VoltageCRC = 0x%04X", crcValue);

              testStepPass("DID1000_READ",
                           "Factor=%f, Offset=%f, CRC=0x%04X",
                           factor, offset, crcValue);
            }
          }
        }
      }
    }
  }
}

```

## DID 0x1001: resistance

```capl

/*==================================================
 * IBS DID 0x1001 电阻校准数据读取
 *
 * ECU : IBS
 * SID : 0x22
 * DID : 0x1001
 * Data:
 *   Initial    4 Byte Float
 *   Quadratic  4 Byte Float
 *   Primary    4 Byte Float
 *   Offset     4 Byte Float
 *   CRC        2 Byte
 *
 * Float32 : Little Endian / 1000000
 *==================================================*/

long ret;
long sent;
long waited;
long size;
long copied;
long i;

byte respData[64];

dword bits;

double initial;
double quadratic;
double primary;
double offset;
long crcValue;

diagRequest IBS.Resistance_calibration_data_Read req;
diagResponse IBS.Resistance_calibration_data_Read resp;


/*========== 1. 设置诊断目标 ==========*/

diagSetTarget("IBS");


/*========== 2. 发送诊断请求 ==========*/

ret = diagSendRequest(req);

if (ret < 0)
{
  testStepFail("DID1001_SEND",
               "Diagnostic request send failed: %d", ret);
}
else
{
  /*========== 3. 等待请求发送完成 ==========*/

  sent = testWaitForDiagRequestSent(req, 2000);

  if (sent != 1)
  {
    testStepFail("DID1001_SEND",
                 "Request not sent: %d", sent);
  }
  else
  {
    /*========== 4. 等待诊断响应 ==========*/

    testStepPass("DID1001_REQ", "TX: 22 10 01");
    testReportWriteDiagObject(req);

    waited = testWaitForDiagResponse(req, 5000);

    if (waited != 1)
    {
      testStepFail("DID1001_WAIT",
                   "Diagnostic response timeout: %d", waited);
    }
    else
    {
      /*========== 5. 获取诊断响应 ==========*/

      ret = diagGetLastResponse(req, resp);

      if (ret < 0)
      {
        testStepFail("DID1001_READ",
                     "Get response failed: %d", ret);
      }
      else
      {
        size = diagGetPrimitiveSize(resp);

        if (size <= 0 || size > elcount(respData))
        {
          testStepFail("DID1001_SIZE",
                       "Invalid response size: %d", size);
        }
        else
        {
          copied = diagGetPrimitiveData(
                     resp,
                     respData,
                     elcount(respData));

          if (copied != size)
          {
            testStepFail("DID1001_READ",
                         "Data copy failed: %d / %d",
                         copied, size);
          }
          else
          {
            /*========== 6. 输出原始响应 ==========*/

            testReportWriteDiagResponse(req);
            write("========== DID 0x1001 RAW ==========");
            write("Response size: %d", size);

            for (i = 0; i < size; i++)
            {
              write("RAW[%d] = 0x%02X",
                    i, respData[i]);
            }

            /*========== 7. 检查否定响应 ==========*/

            if (diagIsNegativeResponse(resp))
            {
              testStepFail("DID1001_NRC",
                           "Negative diagnostic response");
            }
            else if (size != 21 ||
                     respData[0] != 0x62 ||
                     respData[1] != 0x10 ||
                     respData[2] != 0x01)
            {
              testStepFail("DID1001_FORMAT",
                           "Invalid response format, size=%d",
                           size);
            }
            else
            {
              /*========== 8. 解析 Initial ==========*/

              bits = (dword)respData[3]
                   | ((dword)respData[4] << 8)
                   | ((dword)respData[5] << 16)
                   | ((dword)respData[6] << 24);

              initial = interpretAsFloat(bits) / 1000000.0;


              /*========== 9. 解析 Quadratic ==========*/

              bits = (dword)respData[7]
                   | ((dword)respData[8] << 8)
                   | ((dword)respData[9] << 16)
                   | ((dword)respData[10] << 24);

              quadratic = interpretAsFloat(bits) / 1000000.0;


              /*========== 10. 解析 Primary ==========*/

              bits = (dword)respData[11]
                   | ((dword)respData[12] << 8)
                   | ((dword)respData[13] << 16)
                   | ((dword)respData[14] << 24);

              primary = interpretAsFloat(bits) / 1000000.0;


              /*========== 11. 解析 Offset ==========*/

              bits = (dword)respData[15]
                   | ((dword)respData[16] << 8)
                   | ((dword)respData[17] << 16)
                   | ((dword)respData[18] << 24);

              offset = interpretAsFloat(bits) / 1000000.0;


              /*========== 12. 记录完整响应与解析结果 ==========*/

              crcValue = (long)respData[19]
                       | ((long)respData[20] << 8);

              testStepPass("DID1001_RAW_1",
                           "RX: 62 10 01 %02X %02X %02X %02X %02X %02X",
                           respData[3], respData[4], respData[5],
                           respData[6], respData[7], respData[8]);
              testStepPass("DID1001_RAW_2",
                           "RX continued: %02X %02X %02X %02X %02X %02X",
                           respData[9], respData[10], respData[11],
                           respData[12], respData[13], respData[14]);
              testStepPass("DID1001_RAW_3",
                           "RX continued: %02X %02X %02X %02X %02X %02X",
                           respData[15], respData[16], respData[17],
                           respData[18], respData[19], respData[20]);

              write("Initial = %.12f", initial);
              write("Quadratic = %.12f", quadratic);
              write("Primary = %.12f", primary);
              write("Offset = %.12f", offset);
              write("CRC = 0x%04X", crcValue);

              testStepPass("DID1001_RESULT",
                           "Initial=%.12f Quadratic=%.12f Primary=%.12f Offset=%.12f CRC=0x%04X",
                           initial, quadratic, primary, offset, crcValue);
            }
          }
        }
      }
    }
  }
}

```

## DID 0x1005: current

```capl

/*==================================================
 * IBS DID 0x1005 电流采集校准数据读取
 *
 * ECU : IBS
 * SID : 0x22
 * DID : 0x1005
 * Data:
 *   Factor     4 Byte Float
 *   Offset     4 Byte Float
 *   CRC        2 Byte
 *
 * Float32 : Little Endian / 1000
 *==================================================*/

long ret;
long sent;
long waited;
long size;
long copied;
long i;

byte respData[64];

dword bits;

double factor;
double offset;

long crcValue;


/*========== 诊断对象 ==========*/

diagRequest IBS.Current_acquisition_calibration_Read req;
diagResponse IBS.Current_acquisition_calibration_Read resp;


/*========== 1. 设置诊断目标 ==========*/

diagSetTarget("IBS");


/*========== 2. 发送诊断请求 ==========*/

ret = diagSendRequest(req);

if (ret < 0)
{
  testStepFail("DID1005_SEND",
               "Diagnostic request send failed: %d", ret);
}
else
{
  /*========== 3. 等待请求发送完成 ==========*/

  sent = testWaitForDiagRequestSent(req, 2000);

  if (sent != 1)
  {
    testStepFail("DID1005_SEND",
                 "Request not sent: %d", sent);
  }
  else
  {
    /*========== 4. 等待诊断响应 ==========*/

    testStepPass("DID1005_REQ", "TX: 22 10 05");
    testReportWriteDiagObject(req);

    waited = testWaitForDiagResponse(req, 5000);

    if (waited != 1)
    {
      testStepFail("DID1005_WAIT",
                   "Diagnostic response timeout: %d", waited);
    }
    else
    {
      /*========== 5. 获取诊断响应 ==========*/

      ret = diagGetLastResponse(req, resp);

      if (ret < 0)
      {
        testStepFail("DID1005_READ",
                     "Get response failed: %d", ret);
      }
      else
      {
        size = diagGetPrimitiveSize(resp);

        if (size <= 0 || size > elcount(respData))
        {
          testStepFail("DID1005_SIZE",
                       "Invalid response size: %d", size);
        }
        else
        {
          copied = diagGetPrimitiveData(
                     resp,
                     respData,
                     elcount(respData));

          if (copied != size)
          {
            testStepFail("DID1005_READ",
                         "Data copy failed: %d / %d",
                         copied, size);
          }
          else
          {
            /*========== 6. 输出原始响应 ==========*/

            testReportWriteDiagResponse(req);
            write("========== DID 0x1005 RAW ==========");
            write("Response size: %d", size);

            for (i = 0; i < size; i++)
            {
              write("RAW[%d] = 0x%02X",
                    i, respData[i]);
            }

            /*========== 7. 检查否定响应 ==========*/

            if (diagIsNegativeResponse(resp))
            {
              testStepFail("DID1005_NRC",
                           "Negative diagnostic response");
            }
            else if (size != 13 ||
                     respData[0] != 0x62 ||
                     respData[1] != 0x10 ||
                     respData[2] != 0x05)
            {
              testStepFail("DID1005_FORMAT",
                           "Invalid response format, size=%d",
                           size);
            }
            else
            {
              /*========== 8. 解析 Factor ==========*/

              bits = (dword)respData[3]
                   | ((dword)respData[4] << 8)
                   | ((dword)respData[5] << 16)
                   | ((dword)respData[6] << 24);

              factor = interpretAsFloat(bits) / 1000.0;


              /*========== 9. 解析 Offset ==========*/

              bits = (dword)respData[7]
                   | ((dword)respData[8] << 8)
                   | ((dword)respData[9] << 16)
                   | ((dword)respData[10] << 24);

              offset = interpretAsFloat(bits) / 1000.0;


              /*========== 10. 解析 CRC ==========*/

              crcValue = (long)respData[11]
                       | ((long)respData[12] << 8);


              /*========== 11. 记录完整响应与解析结果 ==========*/

              testStepPass("DID1005_RAW",
                           "RX: 62 10 05 %02X %02X %02X %02X %02X %02X %02X %02X %02X %02X",
                           respData[3], respData[4], respData[5],
                           respData[6], respData[7], respData[8],
                           respData[9], respData[10], respData[11],
                           respData[12]);

              write("Factor = %.9f", factor);
              write("Offset = %.9f", offset);
              write("CRC = 0x%04X", crcValue);

              testStepPass("DID1005_RESULT",
                           "Factor=%.9f Offset=%.9f CRC=0x%04X",
                           factor, offset, crcValue);
            }
          }
        }
      }
    }
  }
}

```

Static-only: The three service shortcut qualifiers are from `ECU_IBS_Diag.cdd`, under the project's `IBS` ECU qualifier. Diagnostic API signatures and `interpretAsFloat` are from the installed CANoe 12 CHM. The vTESTstudio project was not opened or compiled (no dongle). Verify the diagnostic transport, timing, report format specifiers, and actual response bytes when integrating on the bench.
