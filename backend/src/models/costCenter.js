module.exports = (sequelize, Sequelize) => {
    const costCenter = sequelize.define('cost_centers', {
        id:          { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        name:        { type: Sequelize.STRING(100), allowNull: false },
        parentId:    { type: Sequelize.UUID, allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        isActive:    { type: Sequelize.BOOLEAN, defaultValue: true }
    });
    costCenter.associate = (models) => {
        models.costCenter.belongsTo(models.costCenter, { foreignKey: 'parentId', as: 'parent' });
        models.costCenter.hasMany(models.costCenter, { foreignKey: 'parentId', as: 'children' });
    };
    return costCenter;
};
