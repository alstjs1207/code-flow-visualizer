class MemberCrudHandler {
  server: any;
  routePath: string;
  service: MemberService;
  mapper: MemberMapper;

  constructor(server: any, options: any, mapper: MemberMapper, service: MemberService) {
    this.server = server;
    this.service = service;
    this.mapper = mapper;
  }

  bindRoute = () => {
    this.routePath = '/member';
    this.find(this.schema.GET);
    this.get(this.schema.GET_ID);
    this.create(this.schema.POST);
    this.signUp(SIGN_UP());
  };

  signUp = (Schema: object): void => {
    this.server.post(`${this.routePath}/sign-up`, this.getOptions(Schema), async (request: any) => {
      const command = this.mapper.bodyMapper(request);
      const { id } = await this.service.signUp(command);
      return { data: { id } };
    });
  };
}
