const fs = require("fs");
const PDFDocument = require("pdfkit-table");
const { sendEmail } = require("../email/sendEmail");
const { getData, getDataDate, getDataUser, getReportedItems, getNonChargeables, getAssociateVideoFee, getPaymentTypes, getProcessingFee, getTablesToShow, getAssociateProfileById, getSupervisers } = require("../sql/sql");
const { adjustmentFeeTable } = require("../tables/adjustmentTable");
const { associateFees, getRate } = require("../tables/associateFees");
const { calculateAssociateFeeForSupervisee } = require("../tables/calculateAssociateFeeForSupervisee,js");
const { duplicateTable } = require("../tables/duplicateTable");
const { footerTable } = require("../tables/footerTables");
const { mainTable } = require("../tables/mainTable");
const { nonChargeables } = require("../tables/nonChargeables");
const { reportedItemsTable } = require("../tables/reportedItemsTable");
const { superviseeTotalTable } = require("../tables/superviseeTotalTable");
const { supervisiesTable, getSupervisiesFunc } = require("../tables/supervisiesTable");
const { totalRemittance } = require("../tables/totalRemittance");
const { calculateSuperviseeFeeFunc } = require("./calculateSuperviseeFee");
const { createInvoiceTableFunc, getNotUnique, getSupervisies, formatter, sortByDate } = require("./pdfKitFunctions");
const { removeDuplicateAndSplitFees } = require("./removeDuplicateAndSplitFees");

exports.createInvoiceTable = async (res, date, worker, workerId, netAppliedTotal, duration_hrs, videoFee, action) => {
    // console.time('report')
    return new Promise(async (resolve, reject) => {
        try {
            let buffers = [];
            let doc = new PDFDocument({ bufferPages: true, margins: { printing: 'highResolution', top: 50, bottom: 50, left: 50, right: 50 } });
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                let pdfData = Buffer.concat(buffers);
                try {
                    if (action === 'email') {
                        // sendEmail(associateEmail, worker, pdfData, emailPassword)
                        setTimeout(() => {
                            resolve(200)
                        }, 2000);
                    }
                    else { resolve(pdfData) }
                } catch (error) {
                    console.log(error)
                    res.send(500)
                }
            });
            try {
                let data = await getDataDate(date, worker)
                sortByDate(data)
                let reportedItemData = await getReportedItems(date, worker)
                let non_chargeables = await getNonChargeables()
                let non_chargeablesArr = non_chargeables.map(x => x.name)
                let proccessingFeeTypes = await getPaymentTypes()
                let workerProfile = await getAssociateProfileById(workerId)
                let respSuperviser = await getSupervisers(worker)

                //*********************Create supervisees Tables *******************
                let supervisies = await getSupervisiesFunc(date, non_chargeablesArr, respSuperviser)

                //******************** REMOVING NON CHARGABLES *********************
                //check if i need to remove the non charables in the total
                let subtotal = data.map(x => x.event_service_item_total).reduce((a, b) => a + b, 0)
                let nonChargeableItems = reportedItemData.filter(x => non_chargeablesArr.find(n => n === x.event_service_item_name) && x.COUNT)

                //******************** REMOVING DUPLICATE & SPLIT FEES (event_id && case_file_name) *********************
                let { duplicateItems, duplicateItemsId } = removeDuplicateAndSplitFees(data)

                //************** ASSOCIATE FEE BAE RATE CALCULATION **********************
                /*COUNT ALL DUPLICATE/SPILIT FEES LEAVING ONLY ONE*/
                let associateFeeTableQty = data.length - Math.max(nonChargeableItems.map(x => x.COUNT).reduce((a, b) => a + b, 0), 0)
                    - Math.max((duplicateItems.length - getNotUnique(duplicateItemsId.map(x => x.event_id)).length), 0)


                //************calculate processing fee (other fee)******************/
                //Create associate fees table
                // make a Set to hold values from namesToDeleteArr
                const itemsToDelete = new Set(nonChargeableItems.concat(duplicateItems));
                const reportedItemDataFiltered = reportedItemData.filter((item) => {
                    return !itemsToDelete.has(item);
                });

                reportedItemDataFiltered.map(x => x.proccessingFee =
            /*add 0.30 cents to proccessing fee*/(parseFloat(proccessingFeeTypes.find(i => x.receipt_reason.includes(i.name)).ammount.split("+")[1].replace(/[^0-9]+/, '')) * x.COUNT)
            /*calculate percentage */ + (parseFloat(proccessingFeeTypes.find(i => x.receipt_reason.includes(i.name)).ammount.split("+")[0].replace(/[^0-9.]/, '')) * x.event_service_item_total) / 100)



                //***************adjustment fees ****************************/
                let adjustmentFee = JSON.parse(workerProfile.map(x => x.adjustmentFee))
                let adjustmentFeeTableData = adjustmentFeeTable(date, adjustmentFee)
                let finalProccessingFee = reportedItemDataFiltered.map(x => x.proccessingFee).reduce((a, b) => a + b, 0)
                let chargeVideoFee = workerProfile.map(x => x.cahrgeVideoFee)[0]
                let blocksBiWeeklyCharge = parseFloat(workerProfile.map(x => x.blocksBiWeeklyCharge)[0])
                let tablesToShow = await getTablesToShow(workerId)
                let showAdjustmentFeeTable = adjustmentFee.length !== 1 && adjustmentFee[0].name !== ''

                //***********calculate supervisee fee********************/
                let superviseeFeeCalculation = respSuperviser.length >= 0 ? await calculateSuperviseeFeeFunc(date, respSuperviser, non_chargeablesArr, nonChargeableItems,
                    proccessingFeeTypes, videoFee) : []

                //*******Associate fee table***********
                let associateType = workerProfile.map(x => x.associateType)
                let qty = associateFeeTableQty
                if (associateType === 'L1 (Supervised Practice)') { qty = duration_hrs }
                let associateFeeBaseRateTables = await associateFees(worker, qty, date, workerId, videoFee, finalProccessingFee, blocksBiWeeklyCharge,
                    Number(adjustmentFeeTableData.rows[1][1].replace(/[^0-9.-]+/g, "")), superviseeFeeCalculation, chargeVideoFee)


                let finalTotalRemittence = associateFeeBaseRateTables.rows.map(x => Number(x.slice(-1)[0].replace(/[^0-9.-]+/g, ""))).reduce((a, b) => a + b, 0)
                createInvoiceTableFunc(doc,
                /*Main Table*/  mainTable(data, date),
                /*Reported Items Table*/reportedItemsTable(reportedItemData, date, subtotal, non_chargeables),
                /*Duplicate Items Table*/duplicateTable(duplicateItems, date),
                /*Non Chargables Table*/nonChargeables(nonChargeableItems, date),
                /*Adjustment fee table*/adjustmentFeeTableData,
                /*Total Remittence Table*/totalRemittance(date, finalTotalRemittence, netAppliedTotal, workerProfile),
                /*Non chargeables Array*/non_chargeablesArr,
                /*worker name*/worker,
                /*Associate Fee base rate table*/associateFeeBaseRateTables,
                /*Supervisees tbale*/ supervisies,
                /*Duplicate items Array*/duplicateItems,
                /*tables to shoe*/ tablesToShow,
                /*show adjustment fee tbale or not*/showAdjustmentFeeTable)

            } catch (error) {
                console.log(error)
                return error
            }
        } catch (err) {
            console.log(err)
            reject(err)
        }
    });
}
