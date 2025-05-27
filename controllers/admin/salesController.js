const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Category = require('../../models/categorySchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');


exports.loadSalesReport = async (req, res) => {
    try {
        // Set default date range to today
        const today = new Date();
        const startDate = new Date(today.setHours(0, 0, 0, 0));
        const endDate = new Date(today.setHours(23, 59, 59, 999));
        
        // Get filter type and custom date range from query params
        const filterType = req.query.filter || 'daily';
        const customStartDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const customEndDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Initialize date range
        let dateRange = { startDate, endDate };
        
        // Set date range based on filter type
        if (filterType === 'weekly') {
            // Get the first day of the current week (Sunday)
            const day = today.getDay();
            const diff = today.getDate() - day;
            dateRange.startDate = new Date(today.setDate(diff));
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            dateRange.endDate = new Date(dateRange.startDate);
            dateRange.endDate.setDate(dateRange.startDate.getDate() + 6);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'monthly') {
            // Get the first day of the current month
            dateRange.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            dateRange.startDate.setHours(0, 0, 0, 0);
            // Get the last day of the current month
            dateRange.endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'yearly') {
            // Get the first day of the current year
            dateRange.startDate = new Date(today.getFullYear(), 0, 1);
            dateRange.startDate.setHours(0, 0, 0, 0);
            // Get the last day of the current year
            dateRange.endDate = new Date(today.getFullYear(), 11, 31);
            dateRange.endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'custom' && customStartDate && customEndDate) {
            // Set custom date range
            dateRange.startDate = new Date(customStartDate);
            dateRange.startDate.setHours(0, 0, 0, 0);
            
            dateRange.endDate = new Date(customEndDate);
            dateRange.endDate.setHours(23, 59, 59, 999);
        }
        
        // Set up pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of transactions per page
        const skip = (page - 1) * limit;
        
        // Get orders for the selected date range
        const orders = await Order.find({
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
            status: { $nin: ['Cancelled', 'Returned'] } 
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon').sort({ createdAt: -1 }); // Sort by most recent first
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Get top products, categories, and coupons
        const topProducts = await getTopProducts(dateRange.startDate, dateRange.endDate);
        const topCategories = await getTopCategories(dateRange.startDate, dateRange.endDate);
        const topCoupons = await getTopCoupons(dateRange.startDate, dateRange.endDate);
        
        // Get payment method distribution
        const paymentMethods = getPaymentMethodDistribution(orders);
        
        // Calculate pagination values
        const totalOrders = orders.length;
        const totalPages = Math.ceil(totalOrders / limit);
        
        res.render('admin/sales-report', {
            title: 'Sales Report',
            filterType,
            dateRange,
            salesMetrics,
            topProducts,
            topCategories,
            topCoupons,
            paymentMethods,
            orders,
            pagination: {
                page,
                limit,
                skip,
                totalPages,
                totalOrders,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error loading sales report:', error);
        res.status(500).render('admin/error', { 
            message: 'Failed to load sales report', 
            error 
        });
    }
};


const calculateSalesMetrics = (orders) => {
    let totalSales = 0;
    let totalDiscount = 0;
    let totalCouponDiscount = 0;
    let totalSavings = 0;
    
    orders.forEach(order => {
        totalSales += order.total;
        totalDiscount += order.discount || 0;
        totalSavings += order.totalSavings || 0;
        
       
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


exports.downloadPdfReport = async (req, res) => {
    try {
        // Get date parameters from request
        const today = new Date();
        const filterType = req.query.filter || 'daily';
        const customStartDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const customEndDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Set default date range
        let startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
        
        let endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        
        // Adjust date range based on filter type
        if (filterType === 'weekly') {
            const day = today.getDay();
            const diff = today.getDate() - day;
            startDate = new Date(today);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'monthly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'yearly') {
            startDate = new Date(today.getFullYear(), 0, 1);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(today.getFullYear(), 11, 31);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'custom' && customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
        }
        
        console.log(`Generating PDF report for period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        // Get orders for the selected date range
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon');
        
        console.log(`Found ${orders.length} orders for the report`);
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Create PDF document
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: `Chocoluxe Sales Report - ${filterType}`,
                Author: 'Chocoluxe Admin',
                Subject: `Sales Report for ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales_report_${filterType}_${new Date().toISOString().split('T')[0]}.pdf`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Generate PDF content
        generatePdfContent(doc, filterType, startDate, endDate, salesMetrics, orders);
        
        // End document
        doc.end();
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).send('Failed to generate PDF report: ' + error.message);
    }
};


const generatePdfContent = (doc, filterType, startDate, endDate, salesMetrics, orders) => {
    // Add header - using only standard fonts
    doc.fontSize(20).text('CHOCOLUXE', { align: 'center' });
    doc.fontSize(16).text('Sales Report', { align: 'center' });
    doc.moveDown();
    
    // Add report metadata
    doc.fontSize(12);
    doc.text(`Report Type: ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`, { align: 'left' });
    doc.text(`Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`, { align: 'left' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown();
    
    // Add sales summary
    doc.fontSize(14).text('Sales Summary', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Orders: ${salesMetrics.orderCount}`, { align: 'left' });
    doc.text(`Total Sales Revenue: ₹${salesMetrics.totalSales.toFixed(2)}`, { align: 'left' });
    doc.text(`Total Discount: ₹${salesMetrics.totalDiscount.toFixed(2)}`, { align: 'left' });
    doc.text(`Coupon Discount: ₹${salesMetrics.totalCouponDiscount.toFixed(2)}`, { align: 'left' });
    doc.text(`Total Savings (Offers): ₹${salesMetrics.totalSavings.toFixed(2)}`, { align: 'left' });
    doc.text(`Gross Revenue (before discounts): ₹${salesMetrics.grossRevenue.toFixed(2)}`, { align: 'left' });
    doc.moveDown();
    
    // Add transaction details section
    doc.fontSize(14).text('Transaction Details', { align: 'left' });
    doc.moveDown(0.5);
    
    // Set up transaction table
    const tableTop = doc.y;
    const tableHeaders = ['Order ID', 'Date', 'Customer', 'Payment', 'Status', 'Discount', 'Total'];
    const columnWidths = [80, 70, 100, 80, 70, 70, 70]; // Adjusted column widths
    const tableWidth = 50; // Left margin
    
    // Add table headers
    let xPos = tableWidth;
    doc.fontSize(10);
    // Make headers bold by using slightly larger font size
    tableHeaders.forEach((header, i) => {
        const alignment = i >= 5 ? 'right' : 'left'; // Right-align monetary values
        doc.text(header, xPos, tableTop, { width: columnWidths[i], align: alignment });
        xPos += columnWidths[i];
    });
    
    // Add header separator line
    doc.moveTo(tableWidth, tableTop + 15).lineTo(tableWidth + columnWidths.reduce((a, b) => a + b, 0), tableTop + 15).stroke();
    
    // Add transaction rows
    let yPos = tableTop + 20;
    doc.fontSize(9);
    
    orders.forEach((order, index) => {
        // Check if we need a new page
        if (yPos > 700) {
            doc.addPage();
            yPos = 50;
            
            // Add table headers to new page
            xPos = tableWidth;
            doc.fontSize(10);
            tableHeaders.forEach((header, i) => {
                const alignment = i >= 5 ? 'right' : 'left'; // Right-align monetary values
                doc.text(header, xPos, yPos, { width: columnWidths[i], align: alignment });
                xPos += columnWidths[i];
            });
            
            // Add header separator line
            doc.moveTo(tableWidth, yPos + 15).lineTo(tableWidth + columnWidths.reduce((a, b) => a + b, 0), yPos + 15).stroke();
            yPos += 20;
            doc.fontSize(9);
        }
        
        // Add transaction data
        xPos = tableWidth;
        doc.text(order.orderId, xPos, yPos, { width: columnWidths[0], align: 'left' });
        xPos += columnWidths[0];
        
        doc.text(new Date(order.createdAt).toLocaleDateString(), xPos, yPos, { width: columnWidths[1], align: 'left' });
        xPos += columnWidths[1];
        
        doc.text(order.shippingAddress.name, xPos, yPos, { width: columnWidths[2], align: 'left' });
        xPos += columnWidths[2];
        
        doc.text(order.paymentMethod, xPos, yPos, { width: columnWidths[3], align: 'left' });
        xPos += columnWidths[3];
        
        doc.text(order.status, xPos, yPos, { width: columnWidths[4], align: 'left' });
        xPos += columnWidths[4];
        
        doc.text(`₹${order.discount.toFixed(2)}`, xPos, yPos, { width: columnWidths[5], align: 'right' });
        xPos += columnWidths[5];
        
        doc.text(`₹${order.total.toFixed(2)}`, xPos, yPos, { width: columnWidths[6], align: 'right' });
        
        yPos += 15;
        
        // Add order items if there's space
        if (order.items && order.items.length > 0 && yPos < 680) {
            xPos = tableWidth + 20; // Indent items under the order
            doc.fontSize(8);
            doc.text('Items:', xPos, yPos, { width: 50, align: 'left' });
            yPos += 10;
            
            order.items.forEach((item, itemIndex) => {
                if (yPos > 700) {
                    doc.addPage();
                    yPos = 50;
                }
                
                if (item.product) {
                    // Format item details with proper alignment
                    const itemText = `${item.quantity} x ${item.product.productName}`;
                    const priceText = `₹${item.price.toFixed(2)} each = ₹${item.subtotal.toFixed(2)}`;
                    
                    doc.text(itemText, xPos + 20, yPos, { width: 250, align: 'left' });
                    doc.text(priceText, xPos + 270, yPos, { width: 150, align: 'right' });
                    yPos += 10;
                }
            });
            
            doc.fontSize(9);
            yPos += 5;
        }
        
        // Add separator line between transactions
        if (index < orders.length - 1) {
            doc.moveTo(50, yPos).lineTo(550, yPos).lineWidth(0.5).stroke();
            yPos += 5;
        }
    });
    
    // Add a separator line between orders
    doc.moveTo(tableWidth, yPos).lineTo(tableWidth + columnWidths.reduce((a, b) => a + b, 0), yPos).stroke();
    yPos += 10;
    
    // Add footer
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
};


exports.downloadExcelReport = async (req, res) => {
    try {
        // Get date parameters from request
        const today = new Date();
        const filterType = req.query.filter || 'daily';
        const customStartDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const customEndDate = req.query.endDate ? new Date(req.query.endDate) : null;
        
        // Set default date range
        let startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
        
        let endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        
        // Adjust date range based on filter type
        if (filterType === 'weekly') {
            const day = today.getDay();
            const diff = today.getDate() - day;
            startDate = new Date(today);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'monthly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'yearly') {
            startDate = new Date(today.getFullYear(), 0, 1);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(today.getFullYear(), 11, 31);
            endDate.setHours(23, 59, 59, 999);
        } else if (filterType === 'custom' && customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
        }
        
        console.log(`Generating Excel report for period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        // Get orders for the selected date range
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        }).populate('coupon');
        
        console.log(`Found ${orders.length} orders for the report`);
        
        // Calculate sales metrics
        const salesMetrics = calculateSalesMetrics(orders);
        
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Chocoluxe';
        workbook.lastModifiedBy = 'Chocoluxe Admin';
        workbook.created = new Date();
        workbook.modified = new Date();
        
        // Generate Excel content
        generateExcelContent(workbook, filterType, startDate, endDate, salesMetrics, orders);
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales_report_${filterType}_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).send('Failed to generate Excel report: ' + error.message);
    }
};


const generateExcelContent = (workbook, filterType, startDate, endDate, salesMetrics, orders) => {
    // Create Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Add title and metadata
    summarySheet.mergeCells('A1:B1');
    summarySheet.getCell('A1').value = 'CHOCOLUXE - Sales Report';
    summarySheet.getCell('A1').font = { size: 16, bold: true };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };
    
    summarySheet.getCell('A3').value = 'Report Type:';
    summarySheet.getCell('B3').value = filterType.charAt(0).toUpperCase() + filterType.slice(1);
    
    summarySheet.getCell('A4').value = 'Period:';
    summarySheet.getCell('B4').value = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    
    summarySheet.getCell('A5').value = 'Generated on:';
    summarySheet.getCell('B5').value = new Date().toLocaleString();
    
    // Add sales summary
    summarySheet.mergeCells('A7:B7');
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
    
    // Format summary cells
    ['A8', 'A9', 'A10', 'A11', 'A12', 'A13'].forEach(cell => {
        summarySheet.getCell(cell).font = { bold: true };
    });
    
    // Create Transactions sheet
    const transactionsSheet = workbook.addWorksheet('Transactions');
    
    // Set up columns for transactions
    transactionsSheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Savings', key: 'savings', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Coupon Code', key: 'couponCode', width: 15 }
    ];
    
    // Format transaction header row
    transactionsSheet.getRow(1).font = { bold: true };
    transactionsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Add transaction data
    orders.forEach(order => {
        transactionsSheet.addRow({
            orderId: order.orderId,
            date: new Date(order.createdAt).toLocaleDateString(),
            customer: order.shippingAddress.name,
            email: order.shippingAddress.email || 'N/A',
            phone: order.shippingAddress.phone || 'N/A',
            paymentMethod: order.paymentMethod,
            status: order.status,
            subtotal: order.subtotal,
            discount: order.discount,
            savings: order.totalSavings || 0,
            total: order.total,
            couponCode: order.coupon ? order.coupon.code : 'None'
        });
    });
    
    // Format currency columns
    transactionsSheet.getColumn('subtotal').numFmt = '₹#,##0.00';
    transactionsSheet.getColumn('discount').numFmt = '₹#,##0.00';
    transactionsSheet.getColumn('savings').numFmt = '₹#,##0.00';
    transactionsSheet.getColumn('total').numFmt = '₹#,##0.00';

    // Create Order Items sheet
    const itemsSheet = workbook.addWorksheet('Order Items');
   
    // Set up columns for order items
    itemsSheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Product', key: 'product', width: 30 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Subtotal', key: 'subtotal', width: 12 }
    ];
    
    // Format order items header row
    itemsSheet.getRow(1).font = { bold: true };
    itemsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Add order items data
    orders.forEach(order => {
        order.items.forEach(item => {
            if (item.product) {
                itemsSheet.addRow({
                    orderId: order.orderId,
                    date: new Date(order.createdAt).toLocaleDateString(),
                    customer: order.shippingAddress.name,
                    product: item.product.productName,
                    sku: item.product.sku || 'N/A',
                    category: item.product.category ? item.product.category.name : 'N/A',
                    quantity: item.quantity,
                    price: item.price,
                    discount: (item.discount || 0),
                    subtotal: item.subtotal
                });
            }
        });
    });
    
    // Format currency columns
    itemsSheet.getColumn('price').numFmt = '₹#,##0.00';
    itemsSheet.getColumn('discount').numFmt = '₹#,##0.00';
    itemsSheet.getColumn('subtotal').numFmt = '₹#,##0.00';
    
    // Create Payment Methods sheet
    const paymentMethodsSheet = workbook.addWorksheet('Payment Methods');
    
    // Set up columns for payment methods
    paymentMethodsSheet.columns = [
        { header: 'Payment Method', key: 'method', width: 20 },
        { header: 'Number of Orders', key: 'count', width: 20 },
        { header: 'Total Amount', key: 'amount', width: 20 }
    ];
    
    // Format payment methods header row
    paymentMethodsSheet.getRow(1).font = { bold: true };
    paymentMethodsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Calculate payment method statistics
    const paymentStats = {};
    orders.forEach(order => {
        const method = order.paymentMethod;
        if (!paymentStats[method]) {
            paymentStats[method] = { count: 0, amount: 0 };
        }
        paymentStats[method].count++;
        paymentStats[method].amount += order.total;
    });
    
    // Add payment method data
    Object.entries(paymentStats).forEach(([method, stats]) => {
        paymentMethodsSheet.addRow({
            method,
            count: stats.count,
            amount: stats.amount
        });
    });
    
    // Format currency column
    paymentMethodsSheet.getColumn('amount').numFmt = '₹#,##0.00';
};

module.exports = {
    loadSalesReport: exports.loadSalesReport,
    downloadPdfReport: exports.downloadPdfReport,
    downloadExcelReport: exports.downloadExcelReport
};
