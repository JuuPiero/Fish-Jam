import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { Spline } from './Spline';
const { ccclass, property } = _decorator;

@ccclass('SplineAnimate')
export class SplineAnimate extends Component {
    @property({ tooltip: "Tốc độ di chuyển (đơn vị: khoảng cách/giây)" })
    public speed: number = 50;

    @property({ tooltip: "Tự động di chuyển khi start" })
    public autoStart: boolean = true;

    private spline: Spline = null!;
    private samples: Vec3[] = [];
    private currentDistance: number = 0;
    private totalLength: number = 0;
    private isMoving: boolean = false;

    protected start(): void {
        if (this.autoStart) {
            this.startMoving();
        }
    }

    protected update(dt: number): void {
        if (!this.isMoving) return;
        if (this.samples.length < 2) return;
        this.currentDistance += this.speed * dt;
        // Loop around when reaching the end
        if (this.currentDistance >= this.totalLength) {
            this.currentDistance -= this.totalLength;
        } else if (this.currentDistance < 0) {
            this.currentDistance += this.totalLength;
        }
        this.updatePosition();
    }

    /**
     * Khởi tạo component với spline và samples
     */
    public init(spline: Spline, samples: Vec3[], startDistance: number = 0): void {
        this.spline = spline;
        this.samples = samples;
        this.totalLength = spline.totalLength;
        this.setDistance(startDistance);
    }

    /**
     * Cập nhật vị trí và rotation dựa trên currentDistance
     */
    private updatePosition(): void {
        // Get position at current distance
        const pos = this.spline.getPointAtDistance(this.samples, this.currentDistance);
        this.node.setWorldPosition(pos);
        
        // Calculate direction for rotation
        let nextDistance = this.currentDistance + 0.1;
        if (nextDistance >= this.totalLength) {
            nextDistance -= this.totalLength;
        }
        const nextPos = this.spline.getPointAtDistance(this.samples, nextDistance);
        
        const dir = new Vec3();
        Vec3.subtract(dir, nextPos, pos);
        dir.normalize();
        
        const rot = new Quat();
        Quat.fromViewUp(rot, dir);
        this.node.setWorldRotation(rot);
    }

    /**
     * Bắt đầu di chuyển
     */
    public startMoving(): void {
        this.isMoving = true;
    }

    /**
     * Dừng di chuyển
     */
    public stopMoving(): void {
        this.isMoving = false;
    }

    /**
     * Reset về vị trí ban đầu
     */
    public reset(): void {
        this.updatePosition();
    }

    /**
     * Set tốc độ di chuyển
     */
    public setSpeed(speed: number): void {
        this.speed = speed;
    }

    /**
     * Set khoảng cách hiện tại
     */
    public setDistance(distance: number): void {
        this.currentDistance = distance;
        this.updatePosition();
    }

    /**
     * Lấy khoảng cách hiện tại
     */
    public getDistance(): number {
        return this.currentDistance;
    }

    /**
     * Lấy tổng chiều dài spline
     */
    public getTotalLength(): number {
        return this.totalLength;
    }

    /**
     * Kiểm tra có đang di chuyển không
     */
    public isMovingNow(): boolean {
        return this.isMoving;
    }

    /**
     * Teleport đến vị trí theo tỷ lệ (0-1)
     */
    public teleportTo(t: number): void {
        t = Math.max(0, Math.min(1, t));
        this.currentDistance = t * this.totalLength;
        this.updatePosition();
    }

    /**
     * Teleport đến vị trí theo khoảng cách
     */
    public teleportToDistance(distance: number): void {
        this.currentDistance = distance % this.totalLength;
        this.updatePosition();
    }
}