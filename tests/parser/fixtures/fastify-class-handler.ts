find = (Schema: object): void => {
  this.server.get(`${this.routePath}`, this.getOptions(Schema), async (request: any) => {
    return this.service.findAll(request);
  });
};

create = (Schema: object): void => {
  this.server.post(`${this.routePath}`, this.getOptions(Schema), async (request: any) => {
    const res = await this.service.save(request);
    return { data: { id: res.id } };
  });
};

update = (Schema: object): void => {
  this.server.put(`${this.routePath}/:id`, this.getOptions(Schema), async (request: any) => {
    const params: any = request.params;
    return this.service.modify(Number(params.id), request);
  });
};

remove = (Schema: object): void => {
  this.server.delete(`${this.routePath}/:id`, this.getOptions(Schema), async (request: any) => {
    const params: any = request.params;
    return this.service.delete(Number(params.id));
  });
};
