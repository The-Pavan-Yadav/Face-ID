export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  faceDescriptor: number[] | null;
  createdAt?: any;
}
