import {
  getSchedulersCollection,
  nameExistsInCollection,
} from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (!body.formData) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const formData = { ...body.formData };
    const name = formData.configName?.trim() || null;
    delete formData.configName;

    if (name && await nameExistsInCollection("schedulerConfigs", "configName", name)) {
      return NextResponse.json(
        { error: `A scheduler configuration named "${name}" already exists` },
        { status: 409 }
      );
    }

    const schedulerId = `scheduler_config_${Math.random()
      .toString(16)
      .slice(2, 10)}`;

    const doc = {
      configName: name || schedulerId,
      createdAt: new Date().toISOString(),
      content: formData,
    };

    const collection = await getSchedulersCollection();
    await collection.upsert(schedulerId, doc);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create scheduler configuration" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "Scheduler config created successfully",
  });
}
