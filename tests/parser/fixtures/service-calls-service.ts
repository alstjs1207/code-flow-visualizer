import { Router } from "express";

const router = Router();

export async function processOrder(req: any, res: any) {
  const { orderId } = req.body;
  if (!orderId) {
    throw new Error("orderId is required");
  }
  const result = await orderService.processOrder(orderId);
  return res.status(200).json(result);
}

router.post("/api/orders/process", processOrder);

export class OrderService {
  customerService: CustomerService;
  orderDao: OrderDao;

  async processOrder(orderId: string) {
    const order = await this.orderDao.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    const customer = await this.customerService.getActiveCustomer(order.customerId);
    return { order, customer };
  }
}

export class CustomerService {
  customerDao: CustomerDao;

  async getActiveCustomer(customerId: string) {
    const customer = await this.customerDao.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }
    return customer;
  }
}
