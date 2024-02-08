import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { FastifyInstance } from "fastify";

// A documentação do fastify pede para utilizar uma função async
export async function createPoll(app: FastifyInstance) {
  app.post("/polls", async (req, res) => {
    const createPollBody = z.object({
      title: z.string(),
      options: z.array(z.string())
    });

    const { title, options } = createPollBody.parse(req.body);
    const poll = await prisma.poll.create({
      data: {
        title,
        options: {
          createMany: {
            data: options.map(option => {
              return { title: option };
            })
          }
        }
      }
    });

    res.status(201).send({ pollId: poll.id });
  });
}
