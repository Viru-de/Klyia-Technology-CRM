import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  authenticateUser,
  requireRoles,
  createSession,
  revokeSession,
  AuthenticatedRequest,
} from './auth';
import { UserRole } from '../src/types';

export const apiRouter = Router();

// ==========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==========================================
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    const userEmail = email || 'viru.patel513@gmail.com';
    const userRole: UserRole = role || 'Admin';

    // Create secure session token
    const session = createSession({
      id: `usr-${Date.now()}`,
      name: userEmail.split('@')[0],
      email: userEmail,
      role: userRole,
    });

    res.json({
      success: true,
      token: session.token,
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/auth/me', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    user: req.user,
  });
});

apiRouter.post('/auth/logout', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token) {
    revokeSession(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// DATABASE STATUS & UTILITIES (RESTRICTED TO ADMIN)
// ==========================================
apiRouter.get('/database/status', async (req: Request, res: Response) => {
  try {
    const status = await db.getStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get(
  '/database/export',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await db.exportAll();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

apiRouter.post(
  '/database/import',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const success = await db.importAll(req.body);
      if (!success) {
        return res.status(400).json({ success: false, error: 'Invalid backup format' });
      }
      res.json({ success: true, message: 'Database restored successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

apiRouter.post(
  '/database/reset-sample',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.resetSample();
      res.json({ success: true, message: 'Database reset to Klyia Technology sample data' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// CLIENTS
// ==========================================
apiRouter.get('/clients', async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const clients = await db.getClients(includeArchived);
    res.json({ success: true, clients });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/clients', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await db.createClient(req.body);
    await db.createLog({
      action: 'Client Created',
      details: `Created client ${client.name} (${client.clientId})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Client',
      entityId: client.id,
    });
    res.status(201).json({ success: true, client });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/clients/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await db.updateClient(req.params.id, req.body);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    await db.createLog({
      action: 'Client Updated',
      details: `Updated details for ${client.name} (${client.clientId})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Client',
      entityId: client.id,
    });
    res.json({ success: true, client });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/clients/:id/archive', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await db.archiveClient(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true, message: 'Client archived' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/clients/:id/restore', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await db.restoreClient(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true, message: 'Client restored' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/clients/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const success = await db.deleteClient(req.params.id);
      res.json({ success, message: 'Client and associated records deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// PURCHASES (PROJECTS / SERVICES)
// ==========================================
apiRouter.get('/purchases', async (req: Request, res: Response) => {
  try {
    const purchases = await db.getPurchases();
    res.json({ success: true, purchases });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/purchases', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const purchase = await db.createPurchase(req.body);

    // If advance paid > 0, automatically record payment receipt
    if (purchase.advancePaid > 0) {
      await db.createPayment({
        clientId: purchase.clientId,
        clientName: purchase.clientName,
        paymentDate: purchase.purchaseDate,
        amount: purchase.advancePaid,
        paymentMode: (purchase.paymentMode as any) || 'Bank Transfer',
        referenceNo: `ADV-${purchase.purchaseId}`,
        notes: `Advance payment for ${purchase.customServiceTitle || purchase.serviceType}`,
        againstType: 'Purchase',
        againstId: purchase.id,
        againstTitle: purchase.customServiceTitle || purchase.serviceType,
      });
    }

    // If renewal date given, automatically add to renewals
    if (purchase.renewalDate) {
      await db.createRenewal({
        clientId: purchase.clientId,
        clientName: purchase.clientName,
        serviceName: purchase.customServiceTitle || purchase.serviceType,
        domainOrAsset: '',
        provider: 'Klyia Technology',
        purchaseDate: purchase.purchaseDate,
        expiryDate: purchase.renewalDate,
        renewalDate: purchase.renewalDate,
        renewalAmount: purchase.grandTotal,
        reminderDays: 30,
        status: 'Upcoming',
        notes: `Auto-generated from purchase ${purchase.purchaseId}`,
      });
    }

    // Update client last purchase date & renewal date
    await db.updateClient(purchase.clientId, {
      lastPurchaseDate: purchase.purchaseDate,
      nextRenewalDate: purchase.renewalDate,
      status: 'Active',
    });

    await db.createLog({
      action: 'Purchase Added',
      details: `Recorded purchase of ₹${purchase.grandTotal} for ${purchase.clientName}`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Client',
      entityId: purchase.clientId,
    });

    res.status(201).json({ success: true, purchase });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/purchases/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const purchase = await db.updatePurchase(req.params.id, req.body);
    if (!purchase) return res.status(404).json({ success: false, error: 'Purchase not found' });
    res.json({ success: true, purchase });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/purchases/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deletePurchase(req.params.id);
      res.json({ success: true, message: 'Purchase deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// QUOTATIONS
// ==========================================
apiRouter.get('/quotations', async (req: Request, res: Response) => {
  try {
    const quotations = await db.getQuotations();
    res.json({ success: true, quotations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/quotations', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quotation = await db.createQuotation(req.body);
    await db.createLog({
      action: 'Quotation Created',
      details: `Created quotation ${quotation.quotationNumber} for ${quotation.clientName} (₹${quotation.grandTotal})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Quotation',
      entityId: quotation.id,
    });
    res.status(201).json({ success: true, quotation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/quotations/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quotation = await db.updateQuotation(req.params.id, req.body);
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });
    res.json({ success: true, quotation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/quotations/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deleteQuotation(req.params.id);
      res.json({ success: true, message: 'Quotation deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// INVOICES
// ==========================================
apiRouter.get('/invoices', async (req: Request, res: Response) => {
  try {
    const invoices = await db.getInvoices();
    res.json({ success: true, invoices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/invoices', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invoice = await db.createInvoice(req.body);
    await db.createLog({
      action: 'Invoice Created',
      details: `Created tax invoice ${invoice.invoiceNumber} for ${invoice.clientName} (₹${invoice.grandTotal})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Invoice',
      entityId: invoice.id,
    });
    res.status(201).json({ success: true, invoice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/invoices/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invoice = await db.updateInvoice(req.params.id, req.body);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, invoice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/invoices/:id',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deleteInvoice(req.params.id);
      res.json({ success: true, message: 'Invoice deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// PAYMENTS & RECEIPTS
// ==========================================
apiRouter.get('/payments', async (req: Request, res: Response) => {
  try {
    const payments = await db.getPayments();
    res.json({ success: true, payments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/payments', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payment = await db.createPayment(req.body);
    await db.createLog({
      action: 'Payment Added',
      details: `Received ₹${payment.amount} from ${payment.clientName} via ${payment.paymentMode} (${payment.receiptNo})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Payment',
      entityId: payment.id,
    });
    res.status(201).json({ success: true, payment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/payments/:id',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deletePayment(req.params.id);
      res.json({ success: true, message: 'Payment deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// RENEWALS
// ==========================================
apiRouter.get('/renewals', async (req: Request, res: Response) => {
  try {
    const renewals = await db.getRenewals();
    res.json({ success: true, renewals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/renewals', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const renewal = await db.createRenewal(req.body);
    res.status(201).json({ success: true, renewal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/renewals/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const renewal = await db.updateRenewal(req.params.id, req.body);
    if (!renewal) return res.status(404).json({ success: false, error: 'Renewal not found' });
    res.json({ success: true, renewal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/renewals/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deleteRenewal(req.params.id);
      res.json({ success: true, message: 'Renewal deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// EXPENSES
// ==========================================
apiRouter.get('/expenses', async (req: Request, res: Response) => {
  try {
    const expenses = await db.getExpenses();
    res.json({ success: true, expenses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/expenses', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const expense = await db.createExpense(req.body);
    await db.createLog({
      action: 'Expense Added',
      details: `Logged ₹${expense.amount} under ${expense.category} (${expense.vendor})`,
      userName: req.user?.name,
      userRole: req.user?.role,
      entityType: 'Expense',
      entityId: expense.id,
    });
    res.status(201).json({ success: true, expense });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/expenses/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const expense = await db.updateExpense(req.params.id, req.body);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, expense });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/expenses/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deleteExpense(req.params.id);
      res.json({ success: true, message: 'Expense deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// DIGITAL ASSETS
// ==========================================
apiRouter.get('/assets', async (req: Request, res: Response) => {
  try {
    const assets = await db.getDigitalAssets();
    res.json({ success: true, assets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/assets', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asset = await db.createDigitalAsset(req.body);
    res.status(201).json({ success: true, asset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/assets/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asset = await db.updateDigitalAsset(req.params.id, req.body);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    res.json({ success: true, asset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete(
  '/assets/:id',
  authenticateUser,
  requireRoles(['Admin', 'Manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.deleteDigitalAsset(req.params.id);
      res.json({ success: true, message: 'Asset deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// SETTINGS (RESTRICTED TO ADMIN)
// ==========================================
apiRouter.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await db.getSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put(
  '/settings',
  authenticateUser,
  requireRoles(['Admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settings = await db.updateSettings(req.body);
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// ACTIVITY LOGS
// ==========================================
apiRouter.get('/activity-logs', async (req: Request, res: Response) => {
  try {
    const logs = await db.getLogs();
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/activity-logs', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const log = await db.createLog(req.body);
    res.status(201).json({ success: true, log });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
