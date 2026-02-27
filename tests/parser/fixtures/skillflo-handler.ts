class MemberHandler {
  server: any;
  routePath: string;
  memberService: MemberService;

  constructor(server: any, memberService: MemberService) {
    this.server = server;
    this.memberService = memberService;
  }

  bindRoute() {
    this.routePath = '/member';
    this.bindGetMember();
    this.bindCreateMember();
  }

  bindGetMember() {
    this.server.get(`${this.routePath}/:id`, {}, async (request: any) => {
      const params: any = request.params;
      return this.memberService.getMemberById(Number(params.id));
    });
  }

  bindCreateMember() {
    this.server.post(`${this.routePath}`, {}, async (request: any) => {
      const body: any = request.body;
      return this.memberService.createMember(body);
    });
  }
}
