
exports.mainTable = (data, date) => {

    return {
        title: "Invoice",
        subtitle: "From " + date.start + " To " + date.end,
        headers: [
            { label: "Date", property: 'FULLDATE', renderer: null, align: "center" },
            { label: "Name", property: 'service_file_presenting_individual_name', renderer: null, align: "center" },
            { label: "Invoice ID", property: 'invoice_id', renderer: null, align: "center" },
            { label: "Service Name", property: 'event_service_item_name', renderer: null, align: "center" },
            { label: "Invoice Fee Qty", property: 'invoice_fee_qty', renderer: null, align: "center" },
            { label: "Total", property: 'TOTAL', renderer: null, align: "center" }
        ],
        datas: [...data],
    }
};