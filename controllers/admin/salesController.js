const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Category = require('../../models/categorySchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Load the sales report page
exports.loadSalesReport = async (req, res) => {
    try {
        // Default to current date for "daily" report
        const today = new Date();
        const startDate = new Date(today.setHours(0, 0, 0, 0));
        const endDate = new Date(today.setHours(23, 59, 59, 999));
        
        // Get filter type from query params or default to 'daily'
        const filterType = req.query.filter || 'daily';
        const customStartDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const customEndDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Set date range based on filter type
        let dateRange = { startDate, endDate };
        
        if (filterType === 'weekly') {
            // Calculate start of week (Sunday)
            const day = today.getDay();
            const diff = today.getDate() - day;
            dateRange.startDate = new Date(today.setDate(diff));
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            // End of week (Saturday)
            dateRange.endDate = new Date(dateRange.startDate);
            dateRange.endDate.setDate(dateRange.startDate.getDate() + 6);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'monthly') {
            // Start of month
            dateRange.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            // End of month
            dateRange.endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'yearly') {
            // Start of year
            dateRange.startDate = new Date(today.getFullYear(), 0, 1);
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            // End of year
            dateRange.endDate = new Date(today.getFullYear(), 11, 31);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'custom' && customStartDate && customEndDate) {
            // Custom date range
            dateRange.startDate = new Date(customStartDate);
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            dateRange.endDate = new Date(customEndDate);
            dateRange.endDate.setHours(23, 59, 59, 999);
        }
        
        // Query orders within the date range
        const orders = await Order.find({
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
            status: { $nin: ['Cancelled', 'Returned'] } // Exclude cancelled and returned orders
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon');
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Get top products
        const topProducts = await getTopProducts(dateRange.startDate, dateRange.endDate);
        
        // Get top categories
        const topCategories = await getTopCategories(dateRange.startDate, dateRange.endDate);
        
        // Get top coupons
        const topCoupons = await getTopCoupons(dateRange.startDate, dateRange.endDate);
        
        // Get payment method distribution
        const paymentMethods = getPaymentMethodDistribution(orders);
        
        res.render('admin/sales-report', {
            title: 'Sales Report',
            filterType,
            dateRange,
            salesMetrics,
            topProducts,
            topCategories,
            topCoupons,
            paymentMethods,
            orders
        });
    } catch (error) {
        console.error('Error loading sales report:', error);
        res.status(500).render('admin/error', { 
            message: 'Failed to load sales report', 
            error 
        });
    }
};

// Helper function to calculate sales metrics
const calculateSalesMetrics = (orders) => {
    let totalSales = 0;
    let totalDiscount = 0;
    let totalCouponDiscount = 0;
    let totalSavings = 0;
    
    orders.forEach(order => {
        totalSales += order.total;
        totalDiscount += order.discount || 0;
        totalSavings += order.totalSavings || 0;
        
        // If coupon was used, count it as coupon discount
        if (order.coupon) {
            totalCouponDiscount += order.discount || 0;
        }
    });
    
    return {
        orderCount: orders.length,
        totalSales,
        totalDiscount,
        totalCouponDiscount,
        totalSavings,
        grossRevenue: totalSales + totalDiscount + totalSavings
    };
};

// Helper function to get top selling products
const getTopProducts = async (startDate, endDate) => {
    const productSales = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                status: { $nin: ['Cancelled', 'Returned'] }
            }
        },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.product',
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.subtotal' }
            }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'productDetails'
            }
        },
        { $unwind: '$productDetails' }
    ]);
    
    return productSales;
};

// Helper function to get top categories
const getTopCategories = async (startDate, endDate) => {
    const categorySales = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                status: { $nin: ['Cancelled', 'Returned'] }
            }
        },
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productDetails'
            }
        },
        { $unwind: '$productDetails' },
        {
            $lookup: {
                from: 'categories',
                localField: 'productDetails.category',
                foreignField: '_id',
                as: 'categoryDetails'
            }
        },
        { $unwind: '$categoryDetails' },
        {
            $group: {
                _id: '$categoryDetails._id',
                categoryName: { $first: '$categoryDetails.name' },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.subtotal' }
            }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 }
    ]);
    
    return categorySales;
};

// Helper function to get top coupons
const getTopCoupons = async (startDate, endDate) => {
    const couponUsage = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                status: { $nin: ['Cancelled', 'Returned'] },
                coupon: { $ne: null }
            }
        },
        {
            $group: {
                _id: '$coupon',
                useCount: { $sum: 1 },
                totalDiscount: { $sum: '$discount' }
            }
        },
        { $sort: { totalDiscount: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: 'coupons',
                localField: '_id',
                foreignField: '_id',
                as: 'couponDetails'
            }
        },
        { $unwind: '$couponDetails' }
    ]);
    
    return couponUsage;
};

// Helper function to get payment method distribution
const getPaymentMethodDistribution = (orders) => {
    const paymentMethods = {};
    
    orders.forEach(order => {
        const method = order.paymentMethod;
        if (!paymentMethods[method]) {
            paymentMethods[method] = {
                count: 0,
                total: 0
            };
        }
        
        paymentMethods[method].count += 1;
        paymentMethods[method].total += order.total;
    });
    
    return paymentMethods;
};

// Generate and download PDF report
exports.downloadPdfReport = async (req, res) => {
    try {
        // Get date range from query params
        const filterType = req.query.filter || 'daily';
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        
        // Set proper time for start and end dates
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Query orders within the date range
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $nin: ['Cancelled', 'Returned'] }
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon');
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales_report_${filterType}_${new Date().toISOString().split('T')[0]}.pdf`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add content to PDF
        generatePdfContent(doc, filterType, startDate, endDate, salesMetrics, orders);
        
        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).send('Failed to generate PDF report');
    }
};

// Generate PDF content
const generatePdfContent = (doc, filterType, startDate, endDate, salesMetrics, orders) => {
    // Add header
    doc.fontSize(20).font('Helvetica-Bold').text('CHOCOLUXE', { align: 'center' });
    doc.fontSize(16).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
    doc.moveDown();
    
    // Add date range
    doc.fontSize(12).font('Helvetica');
    doc.text(`Report Type: ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`, { align: 'left' });
    doc.text(`Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`, { align: 'left' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown();
    
    // Add summary
    doc.fontSize(14).font('Helvetica-Bold').text('Sales Summary', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Orders: ${salesMetrics.orderCount}`, { align: 'left' });
    doc.text(`Total Sales Revenue: ₹${salesMetrics.totalSales.toFixed(2)}`, { align: 'left' });
    doc.text(`Total Discount: ₹${salesMetrics.totalDiscount.toFixed(2)}`, { align: 'left' });
    doc.text(`Coupon Discount: ₹${salesMetrics.totalCouponDiscount.toFixed(2)}`, { align: 'left' });
    doc.text(`Total Savings (Offers): ₹${salesMetrics.totalSavings.toFixed(2)}`, { align: 'left' });
    doc.text(`Gross Revenue (before discounts): ₹${salesMetrics.grossRevenue.toFixed(2)}`, { align: 'left' });
    doc.moveDown();
    
    // Add orders table
    doc.fontSize(14).font('Helvetica-Bold').text('Order Details', { align: 'left' });
    doc.moveDown(0.5);
    
    // Table headers
    const tableTop = doc.y;
    const tableHeaders = ['Order ID', 'Date', 'Customer', 'Payment', 'Discount', 'Total'];
    const columnWidths = [80, 70, 100, 70, 70, 70];
    
    // Draw table headers
    let xPos = 50;
    doc.fontSize(10).font('Helvetica-Bold');
    tableHeaders.forEach((header, i) => {
        doc.text(header, xPos, tableTop, { width: columnWidths[i], align: 'left' });
        xPos += columnWidths[i];
    });
    
    // Draw horizontal line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    // Draw table rows
    let yPos = tableTop + 20;
    doc.fontSize(9).font('Helvetica');
    
    orders.forEach((order, index) => {
        // Check if we need a new page
        if (yPos > 700) {
            doc.addPage();
            yPos = 50;
            
            // Redraw headers on new page
            xPos = 50;
            doc.fontSize(10).font('Helvetica-Bold');
            tableHeaders.forEach((header, i) => {
                doc.text(header, xPos, yPos, { width: columnWidths[i], align: 'left' });
                xPos += columnWidths[i];
            });
            
            // Draw horizontal line
            doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();
            yPos += 20;
            doc.fontSize(9).font('Helvetica');
        }
        
        // Draw row data
        xPos = 50;
        doc.text(order.orderId, xPos, yPos, { width: columnWidths[0], align: 'left' });
        xPos += columnWidths[0];
        
        doc.text(new Date(order.createdAt).toLocaleDateString(), xPos, yPos, { width: columnWidths[1], align: 'left' });
        xPos += columnWidths[1];
        
        doc.text(order.shippingAddress.name, xPos, yPos, { width: columnWidths[2], align: 'left' });
        xPos += columnWidths[2];
        
        doc.text(order.paymentMethod, xPos, yPos, { width: columnWidths[3], align: 'left' });
        xPos += columnWidths[3];
        
        doc.text(`₹${order.discount.toFixed(2)}`, xPos, yPos, { width: columnWidths[4], align: 'left' });
        xPos += columnWidths[4];
        
        doc.text(`₹${order.total.toFixed(2)}`, xPos, yPos, { width: columnWidths[5], align: 'left' });
        
        yPos += 15;
        
        // Draw light horizontal line after each row
        if (index < orders.length - 1) {
            doc.moveTo(50, yPos).lineTo(550, yPos).lineWidth(0.5).stroke();
            yPos += 5;
        }
    });
    
    // Draw final line
    doc.moveTo(50, yPos).lineTo(550, yPos).lineWidth(1).stroke();
    
    // Add footer
    doc.fontSize(10).font('Helvetica-Oblique').text('Thank you for your business!', { align: 'center' });
};

// Generate and download Excel report
exports.downloadExcelReport = async (req, res) => {
    try {
        // Get date range from query params
        const filterType = req.query.filter || 'daily';
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        
        // Set proper time for start and end dates
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Query orders within the date range
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $nin: ['Cancelled', 'Returned'] }
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon');
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        
        // Generate Excel content
        generateExcelContent(workbook, filterType, startDate, endDate, salesMetrics, orders);
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales_report_${filterType}_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Write to response
        await workbook.xlsx.write(res);
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).send('Failed to generate Excel report');
    }
};

// Generate Excel content
const generateExcelContent = (workbook, filterType, startDate, endDate, salesMetrics, orders) => {
    // Add summary worksheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Add header
    summarySheet.mergeCells('A1:F1');
    summarySheet.getCell('A1').value = 'CHOCOLUXE - Sales Report';
    summarySheet.getCell('A1').font = { size: 16, bold: true };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };
    
    // Add report info
    summarySheet.getCell('A3').value = 'Report Type:';
    summarySheet.getCell('B3').value = filterType.charAt(0).toUpperCase() + filterType.slice(1);
    
    summarySheet.getCell('A4').value = 'Period:';
    summarySheet.getCell('B4').value = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    
    summarySheet.getCell('A5').value = 'Generated on:';
    summarySheet.getCell('B5').value = new Date().toLocaleString();
    
    // Add summary data
    summarySheet.getCell('A7').value = 'Sales Summary';
    summarySheet.getCell('A7').font = { size: 14, bold: true };
    
    summarySheet.getCell('A8').value = 'Total Orders:';
    summarySheet.getCell('B8').value = salesMetrics.orderCount;
    
    summarySheet.getCell('A9').value = 'Total Sales Revenue:';
    summarySheet.getCell('B9').value = salesMetrics.totalSales;
    summarySheet.getCell('B9').numFmt = '₹#,##0.00';
    
    summarySheet.getCell('A10').value = 'Total Discount:';
    summarySheet.getCell('B10').value = salesMetrics.totalDiscount;
    summarySheet.getCell('B10').numFmt = '₹#,##0.00';
    
    summarySheet.getCell('A11').value = 'Coupon Discount:';
    summarySheet.getCell('B11').value = salesMetrics.totalCouponDiscount;
    summarySheet.getCell('B11').numFmt = '₹#,##0.00';
    
    summarySheet.getCell('A12').value = 'Total Savings (Offers):';
    summarySheet.getCell('B12').value = salesMetrics.totalSavings;
    summarySheet.getCell('B12').numFmt = '₹#,##0.00';
    
    summarySheet.getCell('A13').value = 'Gross Revenue (before discounts):';
    summarySheet.getCell('B13').value = salesMetrics.grossRevenue;
    summarySheet.getCell('B13').numFmt = '₹#,##0.00';
    
    // Format summary section
    ['A8', 'A9', 'A10', 'A11', 'A12', 'A13'].forEach(cell => {
        summarySheet.getCell(cell).font = { bold: true };
    });
    
    // Add orders worksheet
    const ordersSheet = workbook.addWorksheet('Orders');
    
    // Add headers
    ordersSheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Savings', key: 'savings', width: 12 },
        { header: 'Total', key: 'total', width: 12 }
    ];
    
    // Style header row
    ordersSheet.getRow(1).font = { bold: true };
    ordersSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Add order data
    orders.forEach(order => {
        ordersSheet.addRow({
            orderId: order.orderId,
            date: new Date(order.createdAt).toLocaleDateString(),
            customer: order.shippingAddress.name,
            paymentMethod: order.paymentMethod,
            status: order.status,
            subtotal: order.subtotal,
            discount: order.discount,
            savings: order.totalSavings,
            total: order.total
        });
    });
    
    // Format currency columns
    ordersSheet.getColumn('subtotal').numFmt = '₹#,##0.00';
    ordersSheet.getColumn('discount').numFmt = '₹#,##0.00';
    ordersSheet.getColumn('savings').numFmt = '₹#,##0.00';
    ordersSheet.getColumn('total').numFmt = '₹#,##0.00';
    
    // Add items worksheet
    const itemsSheet = workbook.addWorksheet('Order Items');
    
    // Add headers
    itemsSheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Product', key: 'product', width: 30 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Subtotal', key: 'subtotal', width: 12 }
    ];
    
    // Style header row
    itemsSheet.getRow(1).font = { bold: true };
    itemsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Add item data
    orders.forEach(order => {
        order.items.forEach(item => {
            if (item.product) {
                itemsSheet.addRow({
                    orderId: order.orderId,
                    date: new Date(order.createdAt).toLocaleDateString(),
                    product: item.product.productName,
                    category: item.product.category ? item.product.category.name : 'N/A',
                    quantity: item.quantity,
                    price: item.price,
                    subtotal: item.subtotal
                });
            }
        });
    });
    
    // Format currency columns
    itemsSheet.getColumn('price').numFmt = '₹#,##0.00';
    itemsSheet.getColumn('subtotal').numFmt = '₹#,##0.00';
};

module.exports = {
    loadSalesReport: exports.loadSalesReport,
    downloadPdfReport: exports.downloadPdfReport,
    downloadExcelReport: exports.downloadExcelReport
};
