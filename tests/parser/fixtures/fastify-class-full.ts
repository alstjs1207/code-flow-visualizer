class AccountCrudHandler {
  server: any;
  service: AccountService;
  routePath: string;
  mapper: AccountMapper;

  constructor(server: any, service: AccountService, mapper: AccountMapper) {
    this.server = server;
    this.service = service;
    this.mapper = mapper;
    this.routePath = `/${Account.name.toLowerCase()}`;
  }

  getAccount = (Schema: object): void => {
    this.server.get(`${this.routePath}`, this.getOptions(Schema), async (request: any) => {
      const id = this.mapper.parseAccountParams(request);
      return this.service.getAccountById(id);
    });
  };

  createAccount = (Schema: object): void => {
    this.server.post(`${this.routePath}`, this.getOptions(Schema), async (request: any) => {
      const command = this.mapper.parseAccountCommand(request);
      return this.service.createAccount(command);
    });
  };

  updateAccount = (Schema: object): void => {
    this.server.put(`${this.routePath}/:id`, this.getOptions(Schema), async (request: any) => {
      const id = this.mapper.parseAccountParams(request);
      const command = this.mapper.parseAccountCommand(request);
      return this.service.updateAccount(id, command);
    });
  };
}
