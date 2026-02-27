class AccountDeviceHandler extends BaseCrudHandler<AccountDeviceService, AccountDeviceMapper> {
  bindRoute = () => {
    this.routePath = '/account-device';
    this.create(REGISTER_DEVICE());
  };

  create = (Schema: object): void => {
    this.server.post(`${this.routePath}`, this.getOptions(Schema), async (request: any) => {
      const command = this.mapper.parseRegisterDeviceRequest(request.body);
      const data = await this.service.registerDevice(command);
      return { data };
    });
  };
}
